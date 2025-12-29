/**
 * Unified Authentication Callback Handler
 * Routes to appropriate provider based on 'provider' query parameter
 * Supported providers: auth0, saml
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateTokens } from '../../services/auth/jwt';
import { logger } from '../../lib/logger';

interface SAMLResponse {
  nameID: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  groups?: string[];
  attributes: Record<string, string>;
}

/**
 * Parse SAML response (simplified - in production use passport-saml or similar)
 */
function parseSAMLResponse(samlResponse: string): SAMLResponse {
  // In production, use a proper SAML library like passport-saml
  // This is a placeholder showing the structure
  
  // Decode and parse SAML assertion
  // In real implementation, this would parse XML and verify signatures
  Buffer.from(samlResponse, 'base64').toString('utf-8');
  
  // Extract user attributes from SAML assertion
  // This is simplified - real implementation needs XML parsing and signature verification
  
  return {
    nameID: 'user@example.com',
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'analyst',
    groups: ['security-team'],
    attributes: {}
  };
}

/**
 * Map SAML groups to ARES roles
 */
function mapGroupsToRole(groups: string[]): string {
  // Map IdP groups to ARES roles
  const roleMapping: Record<string, string> = {
    'ares-admin': 'admin',
    'security-admin': 'admin',
    'red-team-lead': 'red_team_lead',
    'red-team': 'analyst',
    'security-analyst': 'analyst',
    'viewer': 'viewer'
  };

  // Check groups in priority order
  for (const group of groups) {
    const normalizedGroup = group.toLowerCase();
    if (roleMapping[normalizedGroup]) {
      return roleMapping[normalizedGroup];
    }
  }

  // Default to viewer if no matching group
  return 'viewer';
}

/**
 * Generate JWT token for authenticated user (SAML)
 */
function generateSAMLToken(user: SAMLResponse): string {
  // IMPORTANT: This is a placeholder implementation
  // In production, use a proper JWT library (jsonwebtoken) with signing
  // Example:
  // import jwt from 'jsonwebtoken';
  // return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '24h' });
  
  const payload = {
    sub: user.nameID,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role || mapGroupsToRole(user.groups || []),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  // WARNING: This creates an UNSIGNED token for development/testing only
  // DO NOT use in production - implement proper JWT signing
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured - cannot sign token');
  }
  
  // TODO: Replace with proper JWT signing using jsonwebtoken library
  // const jwt = require('jsonwebtoken');
  // return jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256' });
  
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Handle Auth0 callback
 */
async function handleAuth0Callback(req: VercelRequest, res: VercelResponse) {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      logger.error('Auth0 OAuth error', new Error(error as string), { error_description });
      return res.redirect(`/?error=${encodeURIComponent(error as string)}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing authorization code or state'
      });
    }

    // Verify state parameter (CSRF protection)
    const stateCookie = req.headers.cookie?.match(/auth0_state=([^;]+)/)?.[1];
    if (!stateCookie || stateCookie !== state) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid state parameter'
      });
    }

    // Get Auth0 configuration
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const auth0ClientId = process.env.AUTH0_CLIENT_ID;
    const auth0ClientSecret = process.env.AUTH0_CLIENT_SECRET;
    const auth0CallbackUrl = process.env.AUTH0_CALLBACK_URL;

    if (!auth0Domain || !auth0ClientId || !auth0ClientSecret || !auth0CallbackUrl) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Auth0 is not configured properly'
      });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(`https://${auth0Domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: auth0ClientId,
        client_secret: auth0ClientSecret,
        code: code as string,
        redirect_uri: auth0CallbackUrl
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error('Token exchange failed', new Error('Token exchange failed'), { errorData });
      return res.redirect(`/?error=token_exchange_failed`);
    }

    const tokens = await tokenResponse.json();

    // Get user info from Auth0
    const userInfoResponse = await fetch(`https://${auth0Domain}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch user info', new Error('Failed to fetch user info'));
      return res.redirect(`/?error=user_info_failed`);
    }

    const userInfo = await userInfoResponse.json();

    // Map Auth0 user to our user model
    // In production, you would:
    // 1. Look up or create user in your database
    // 2. Assign roles based on Auth0 app metadata or your own logic
    // 3. Store session in database
    const role = userInfo['https://ares.app/roles']?.[0] || 'analyst'; // Custom claim from Auth0
    const organizationId = userInfo['https://ares.app/org_id']; // Custom claim from Auth0

    // Generate our own JWT tokens with scoped claims
    const ourTokens = generateTokens({
      userId: userInfo.sub,
      email: userInfo.email,
      role: role,
      organizationId: organizationId,
      permissions: userInfo['https://ares.app/permissions'] || []
    });

    // Set tokens as secure HttpOnly cookies
    const cookieOptions = 'HttpOnly; Secure; SameSite=Strict; Path=/';
    const accessTokenExpiry = new Date(Date.now() + 3600 * 1000).toUTCString(); // 1 hour
    const refreshTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString(); // 7 days
    
    res.setHeader('Set-Cookie', [
      `access_token=${ourTokens.accessToken}; ${cookieOptions}; Max-Age=3600; Expires=${accessTokenExpiry}`,
      `refresh_token=${ourTokens.refreshToken}; ${cookieOptions}; Max-Age=604800; Expires=${refreshTokenExpiry}`,
      'auth0_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/' // Clear state cookie
    ]);

    // Redirect to app (tokens are now in secure cookies)
    res.redirect(302, '/?auth=success');
  } catch (error: unknown) {
    logger.error('Auth0 callback error', error instanceof Error ? error : new Error(String(error)));
    return res.redirect(`/?error=authentication_failed`);
  }
}

/**
 * Handle SAML callback
 */
async function handleSAMLCallback(req: VercelRequest, res: VercelResponse) {
  try {
    const { SAMLResponse, RelayState } = req.body;

    if (!SAMLResponse) {
      return res.status(400).json({ error: 'Missing SAML response' });
    }

    // Parse and validate SAML response
    const user = parseSAMLResponse(SAMLResponse);

    // Generate JWT token
    const token = generateSAMLToken(user);

    // Set secure cookie
    res.setHeader('Set-Cookie', [
      `ares_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${24 * 60 * 60}`,
      `ares_user=${encodeURIComponent(JSON.stringify({ email: user.email, role: user.role }))}; Path=/; Max-Age=${24 * 60 * 60}`
    ]);

    // Redirect to application or RelayState URL
    const redirectUrl = RelayState || '/';
    res.redirect(302, redirectUrl);

  } catch (error) {
    console.error('SAML callback error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Get provider from query parameter
  const provider = (req.query.provider as string)?.toLowerCase();

  // SAML uses POST, Auth0 uses GET
  if (provider === 'saml' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. SAML callback requires POST.' });
  }

  if (provider === 'auth0' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Auth0 callback requires GET.' });
  }

  // Route to appropriate provider handler
  switch (provider) {
    case 'auth0':
      return handleAuth0Callback(req, res);
    case 'saml':
      return handleSAMLCallback(req, res);
    default:
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or missing provider. Supported providers: auth0, saml'
      });
  }
}
