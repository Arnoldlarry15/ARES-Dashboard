// Token Refresh Endpoint
// Allows clients to refresh expired access tokens using refresh tokens

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRefreshToken, generateTokens } from '../../services/auth/jwt';
import { securityHeaders, cors, requestLogger, compose } from '../middleware/security';
import { rateLimit } from '../middleware/rateLimit';

async function handleRefresh(req: VercelRequest, res: VercelResponse) {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Refresh token is required'
      });
    }

    // Verify the refresh token
    const payload = verifyRefreshToken(refreshToken);
    
    if (!payload) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token'
      });
    }

    // Generate new tokens
    const tokens = generateTokens({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      permissions: payload.permissions
    });

    return res.status(200).json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 3600 // 1 hour in seconds
    });
  } catch (error: any) {
    console.error('Token refresh error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to refresh token'
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only POST method is allowed'
    });
  }

  // Apply middleware
  const middleware = compose(
    securityHeaders,
    cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }),
    requestLogger,
    rateLimit({ maxRequests: 20, windowMs: 60000 }) // 20 requests per minute
  );

  middleware(req, res, async () => {
    await handleRefresh(req, res);
  });
}
