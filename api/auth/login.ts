/**
 * Unified Authentication Login Handler
 * Routes to appropriate provider based on 'provider' query parameter
 * Supported providers: auth0, saml
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import {
  createCsrfToken,
  generateTokens,
  isLocalAuthAllowed,
  isProductionEnvironment
} from '../../services/auth/jwt';
import { UserRepository } from '../../repositories/userRepository';
import { csrfProtection, securityHeaders } from '../../lib/middleware/security';

interface SAMLConfig {
  entryPoint: string;
  issuer: string;
  callbackUrl: string;
  cert?: string;
}

/**
 * Get SAML configuration from environment
 */
function getSAMLConfig(): SAMLConfig {
  const config: SAMLConfig = {
    entryPoint: process.env.SAML_ENTRY_POINT || '',
    issuer: process.env.SAML_ISSUER || 'ares-dashboard',
    callbackUrl: process.env.SAML_CALLBACK_URL || 'https://your-domain.com/api/auth/callback?provider=saml',
    cert: process.env.SAML_CERT
  };

  if (!config.entryPoint) {
    throw new Error('SAML_ENTRY_POINT not configured');
  }

  return config;
}

/**
 * Generate SAML authentication request
 */
function generateSAMLRequest(config: SAMLConfig): string {
  // In production, use a proper SAML library like passport-saml
  // This is a simplified example showing the structure
  
  // Use cryptographically secure random ID generation
  const id = `_${crypto.randomUUID().replace(/-/g, '')}`;
  const issueInstant = new Date().toISOString();
  
  const request = `<?xml version="1.0"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="${id}"
                    Version="2.0"
                    IssueInstant="${issueInstant}"
                    AssertionConsumerServiceURL="${config.callbackUrl}">
  <saml:Issuer>${config.issuer}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
                      AllowCreate="true"/>
</samlp:AuthnRequest>`;

  // Encode as base64
  return Buffer.from(request).toString('base64');
}

/**
 * Handle Auth0 login
 */
function handleAuth0Login(req: VercelRequest, res: VercelResponse) {
  // Check if Auth0 is configured
  const auth0Domain = process.env.AUTH0_DOMAIN;
  const auth0ClientId = process.env.AUTH0_CLIENT_ID;
  const auth0CallbackUrl = process.env.AUTH0_CALLBACK_URL;

  if (!auth0Domain || !auth0ClientId || !auth0CallbackUrl) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Auth0 is not configured. Please set AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CALLBACK_URL environment variables.'
    });
  }

  // Generate state parameter for CSRF protection using CSPRNG
  const state = crypto.randomBytes(32).toString('hex');

  // Build Auth0 authorization URL
  const authUrl = new URL(`https://${auth0Domain}/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', auth0ClientId);
  authUrl.searchParams.set('redirect_uri', auth0CallbackUrl);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);

  // Set state cookie for validation in callback
  const secureFlag = isProductionEnvironment() ? '; Secure' : '';
  res.setHeader('Set-Cookie', `auth0_state=${state}; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=600; Path=/`);

  // Redirect to Auth0
  res.redirect(302, authUrl.toString());
}

/**
 * Handle SAML login (disabled until signed XML assertion verification is configured)
 */
async function handleSAMLLogin(_req: VercelRequest, res: VercelResponse) {
  return res.status(501).json({
    error: 'Not Implemented',
    message: 'SAML SSO is disabled in this release. Configure Auth0 (provider=auth0) or local development auth.'
  });
}

async function handleLocalDevLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isLocalAuthAllowed()) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Local development authentication is disabled'
    });
  }

  // Never trust client-submitted role, userId, or orgId. Always authenticate fixed least-privilege dev user.
  let userId = 'local_dev_analyst';
  const email = 'dev-analyst@local.ares.app';
  let role = 'analyst';
  let organizationId = 'local_dev_org';

  if (process.env.DATABASE_URL) {
    const dbUser = await UserRepository.findOrCreateLocalDevUser();
    userId = dbUser.id;
    role = dbUser.role;
    organizationId = dbUser.orgId;
  }

  const tokens = generateTokens({
    userId,
    email,
    role,
    organizationId,
    authProvider: 'local'
  });

  const csrfToken = createCsrfToken(tokens.jti);
  const secureFlag = isProductionEnvironment() ? '; Secure' : '';

  res.setHeader('Set-Cookie', [
    `access_token=${tokens.accessToken}; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=3600; Path=/`,
    `csrf_token=${csrfToken}${secureFlag}; SameSite=Lax; Max-Age=3600; Path=/`
  ]);

  return res.status(200).json({
    user: {
      id: userId,
      email,
      name: 'Local Dev Analyst',
      role
    },
    expiresIn: 3600
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  securityHeaders(req, res, () => {});

  // Get provider from query parameter
  const provider = (req.query.provider as string)?.toLowerCase();

  if (provider === 'logout') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const csrfOk = await new Promise<boolean>((resolve) => {
      csrfProtection(req, res, () => resolve(true));
      if (res.writableEnded) resolve(false);
    });
    if (!csrfOk || res.writableEnded) return;
    const secureFlag = isProductionEnvironment() ? '; Secure' : '';
    const expired = 'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/';
    res.setHeader('Set-Cookie', [
      `access_token=; HttpOnly${secureFlag}; SameSite=Lax; ${expired}`,
      `__Host-access_token=; HttpOnly; Secure; SameSite=Lax; ${expired}`,
      `refresh_token=; HttpOnly${secureFlag}; SameSite=Lax; ${expired}`,
      `__Host-refresh_token=; HttpOnly; Secure; SameSite=Lax; ${expired}`,
      `csrf_token=; SameSite=Lax${secureFlag}; ${expired}`,
      `__Host-csrf_token=; Secure; SameSite=Lax; ${expired}`
    ]);
    return res.status(200).json({ success: true });
  }

  if (provider === 'local') {
    return handleLocalDevLogin(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Route to appropriate provider handler
  switch (provider) {
    case 'auth0':
      return handleAuth0Login(req, res);
    case 'saml':
      return handleSAMLLogin(req, res);
    default:
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or missing provider. Supported providers: auth0, saml'
      });
  }
}
