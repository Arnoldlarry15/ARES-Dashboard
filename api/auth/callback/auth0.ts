// Auth0 Callback Endpoint
// Handles OAuth2 callback and exchanges authorization code for tokens

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateTokens } from '../../../services/auth/jwt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      console.error('Auth0 OAuth error:', error, error_description);
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
      console.error('Token exchange failed:', errorData);
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
      console.error('Failed to fetch user info');
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

    // Clear state cookie
    res.setHeader('Set-Cookie', 'auth0_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/');

    // Redirect to app with our JWT token
    const redirectUrl = `/?token=${ourTokens.accessToken}&refresh_token=${ourTokens.refreshToken}`;
    res.redirect(302, redirectUrl);
  } catch (error: any) {
    console.error('Auth0 callback error:', error);
    return res.redirect(`/?error=authentication_failed`);
  }
}
