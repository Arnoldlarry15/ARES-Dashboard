// Example Protected API Endpoint
// Demonstrates server-side RBAC enforcement

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, requireRole, AuthenticatedRequest } from './middleware/auth';
import { securityHeaders, cors, requestLogger, compose } from './middleware/security';
import { rateLimit } from './middleware/rateLimit';

async function handleRequest(req: AuthenticatedRequest, res: VercelResponse) {
  // At this point, we know the user is authenticated and has proper role
  // because the middleware has validated it
  
  const { user } = req;
  
  return res.status(200).json({
    message: 'Success! You have access to this protected resource.',
    user: {
      userId: user!.userId,
      email: user!.email,
      role: user!.role,
      organizationId: user!.organizationId
    },
    timestamp: new Date().toISOString()
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method Not Allowed',
      message: 'Only GET method is allowed'
    });
  }

  // Apply middleware with authentication and role-based access control
  // This endpoint requires users to be authenticated and have one of the allowed roles
  const middleware = compose(
    securityHeaders,
    cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }),
    requestLogger,
    rateLimit({ maxRequests: 100, windowMs: 60000 }),
    requireAuth,
    requireRole(['admin', 'red_team_lead', 'analyst']) // Only these roles can access
  );

  middleware(req, res, async () => {
    await handleRequest(req as AuthenticatedRequest, res);
  });
}
