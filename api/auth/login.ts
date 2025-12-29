/**
 * Unified Authentication Login Handler
 * Routes to appropriate provider based on 'provider' query parameter
 * Supported providers: auth0, saml
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

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

  // Generate state parameter for CSRF protection
  const state = Buffer.from(JSON.stringify({
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(7)
  })).toString('base64');

  // Build Auth0 authorization URL
  const authUrl = new URL(`https://${auth0Domain}/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', auth0ClientId);
  authUrl.searchParams.set('redirect_uri', auth0CallbackUrl);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('state', state);

  // Set state cookie for validation in callback
  res.setHeader('Set-Cookie', `auth0_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);

  // Redirect to Auth0
  res.redirect(302, authUrl.toString());
}

/**
 * Handle SAML login
 */
async function handleSAMLLogin(req: VercelRequest, res: VercelResponse) {
  try {
    // Get SAML configuration
    const config = getSAMLConfig();

    // Get relay state from query params (for post-auth redirect)
    const relayState = (req.query.returnTo as string) || '/';

    // Generate SAML request
    const samlRequest = generateSAMLRequest(config);

    // Build redirect URL
    const params = new URLSearchParams({
      SAMLRequest: samlRequest,
      RelayState: relayState
    });

    const redirectUrl = `${config.entryPoint}?${params.toString()}`;

    // Redirect to IdP
    res.redirect(302, redirectUrl);

  } catch (error) {
    console.error('SAML login error:', error);
    return res.status(500).json({ 
      error: 'Failed to initiate SAML login',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get provider from query parameter
  const provider = (req.query.provider as string)?.toLowerCase();

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
