// Auth0 Login Endpoint
// Initiates OAuth2/OIDC flow with Auth0

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
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
