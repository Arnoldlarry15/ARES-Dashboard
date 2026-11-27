// API endpoint for user operations
import type { VercelResponse } from '@vercel/node';
import { UserRepository } from '../repositories/userRepository';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import { securityHeaders, cors, requestLogger, csrfProtection, compose } from '../lib/middleware/security';
import { requireAuth, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logger';
import { limiter } from '../lib/middleware/rateLimit';

// GET /api/users - Get self or (admin-only) user by email, id, or orgId
// POST /api/users - Create a new user (admin-only)
// PUT /api/users - Update a user (admin-only)
// DELETE /api/users - Delete a user (admin-only)

const ALLOWED_ROLES = new Set(['admin', 'red_team_lead', 'analyst', 'viewer']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    const isAdmin = authUser.role === 'admin';
    const method = req.method;

    switch (method) {
      case 'GET': {
        const { email, id, orgId } = req.query;

        if (id) {
          if (!isAdmin && id !== authUser.userId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          const user = await UserRepository.findById(id as string);
          if (user && authUser.organizationId && user.orgId !== authUser.organizationId && user.id !== authUser.userId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          return res.status(200).json({ user });
        }

        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }

        if (email) {
          const user = await UserRepository.findByEmail(email as string);
          if (user && authUser.organizationId && user.orgId !== authUser.organizationId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          return res.status(200).json({ user });
        }

        if (orgId) {
          if (authUser.organizationId && orgId !== authUser.organizationId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          const users = await UserRepository.findByOrgId(orgId as string);
          return res.status(200).json({ users });
        }

        return res.status(400).json({ error: 'Missing query parameter: email, id, or orgId' });
      }

      case 'POST': {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }
        const { email, name, role, orgId } = req.body;

        if (!email || !role || !orgId) {
          return res.status(400).json({ error: 'Missing required fields: email, role, orgId' });
        }
        if (typeof email !== 'string' || !EMAIL_REGEX.test(email) || email.length > 254) {
          return res.status(400).json({ error: 'Invalid email address' });
        }
        if (typeof role !== 'string' || !ALLOWED_ROLES.has(role)) {
          return res.status(400).json({ error: 'Invalid role' });
        }
        if (authUser.organizationId && orgId !== authUser.organizationId) {
          return res.status(403).json({ error: 'Forbidden: cross-organization user creation denied' });
        }

        const user = await UserRepository.create({ email, name, role, orgId });

        await AuditLogRepository.create({
          actorId: authUser.userId,
          action: 'user_created',
          target: user.id,
          details: { email, role, orgId },
        });

        return res.status(201).json({ user });
      }

      case 'PUT': {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }
        const { id, name, role } = req.body;

        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'Missing required field: id' });
        }
        if (role !== undefined && (typeof role !== 'string' || !ALLOWED_ROLES.has(role))) {
          return res.status(400).json({ error: 'Invalid role' });
        }

        const existingTarget = await UserRepository.findById(id);
        if (!existingTarget) {
          return res.status(404).json({ error: 'User not found' });
        }
        if (authUser.organizationId && existingTarget.orgId !== authUser.organizationId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const user = await UserRepository.update(id, { name, role });

        await AuditLogRepository.create({
          actorId: authUser.userId,
          action: 'user_updated',
          target: id,
          details: { name, role },
        });

        return res.status(200).json({ user });
      }

      case 'DELETE': {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }
        const { id } = req.query;

        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'Missing required parameter: id' });
        }

        const existingTarget = await UserRepository.findById(id);
        if (!existingTarget) {
          return res.status(404).json({ error: 'User not found' });
        }
        if (authUser.organizationId && existingTarget.orgId !== authUser.organizationId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        await UserRepository.delete(id);

        await AuditLogRepository.create({
          actorId: authUser.userId,
          action: 'user_deleted',
          target: id as string,
          details: {},
        });

        return res.status(200).json({ message: 'User deleted successfully' });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('User API error', error as Error, {
      method: req.method,
      url: req.url,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export default async function (req: AuthenticatedRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors({ origin: (process.env.ALLOWED_ORIGINS?.split(',') || []).map(o => o.trim()).filter(Boolean), credentials: true }),
    requestLogger,
    limiter,
    requireAuth,
    csrfProtection
  );

  await middleware(req, res, async () => {
    await catchAsync(handler)(req, res);
  });
}
