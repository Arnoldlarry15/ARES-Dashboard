// API endpoint for audit log operations
import type { VercelResponse } from '@vercel/node';
import { AuditLogRepository, type AuditLogFilter } from '../repositories/auditLogRepository';
import { securityHeaders, cors, requestLogger, csrfProtection, compose } from '../lib/middleware/security';
import { requireAuth, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logger';
import { limiter } from '../lib/middleware/rateLimit';

// GET /api/audit-logs - Get audit logs (admins/red_team_lead can filter; analysts see only their own)
// POST /api/audit-logs - Append an audit log entry for the authenticated actor

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    const isPrivileged = authUser.role === 'admin' || authUser.role === 'red_team_lead';
    const method = req.method;

    switch (method) {
      case 'GET': {
        const { actorId, action, startDate, endDate, skip, take } = req.query;

        const filter: AuditLogFilter = {};
        if (!isPrivileged) {
          if (actorId && actorId !== authUser.userId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          filter.actorId = authUser.userId;
        } else if (actorId) {
          filter.actorId = actorId as string;
        }

        if (action && typeof action === 'string') filter.action = action;
        if (startDate) {
          const parsedStart = new Date(startDate as string);
          if (Number.isNaN(parsedStart.getTime())) {
            return res.status(400).json({ error: 'Invalid startDate' });
          }
          filter.startDate = parsedStart;
        }
        if (endDate) {
          const parsedEnd = new Date(endDate as string);
          if (Number.isNaN(parsedEnd.getTime())) {
            return res.status(400).json({ error: 'Invalid endDate' });
          }
          filter.endDate = parsedEnd;
        }

        const options: { skip?: number; take?: number } = { take: 50 };
        if (skip !== undefined) {
          const parsedSkip = parseInt(skip as string, 10);
          if (Number.isNaN(parsedSkip) || parsedSkip < 0) {
            return res.status(400).json({ error: 'Invalid skip parameter' });
          }
          options.skip = parsedSkip;
        }
        if (take !== undefined) {
          const parsedTake = parseInt(take as string, 10);
          if (Number.isNaN(parsedTake) || parsedTake < 1) {
            return res.status(400).json({ error: 'Invalid take parameter' });
          }
          options.take = Math.min(parsedTake, 100);
        }

        const auditLogs = await AuditLogRepository.findMany(filter, options);
        const count = await AuditLogRepository.count(filter);

        return res.status(200).json({ auditLogs, count });
      }

      case 'POST': {
        if (authUser.role === 'viewer') {
          return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot create audit log entries' });
        }
        const { action, target, details } = req.body;

        if (typeof action !== 'string' || !action.trim() || action.length > 100 ||
            typeof target !== 'string' || !target.trim() || target.length > 200) {
          return res.status(400).json({
            error: 'Missing or invalid required fields: action, target'
          });
        }

        const serverIp =
          (typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip']) ||
          (typeof req.headers['x-forwarded-for'] === 'string' && req.headers['x-forwarded-for'].split(',')[0].trim()) ||
          req.socket?.remoteAddress ||
          undefined;
        const serverUserAgent =
          typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : undefined;

        const auditLog = await AuditLogRepository.create({
          actorId: authUser.userId,
          action: action.trim(),
          target: target.trim(),
          details: details && typeof details === 'object' ? details : undefined,
          ipAddress: serverIp,
          userAgent: serverUserAgent,
        });

        return res.status(201).json({ auditLog });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('Audit log API error', error as Error, {
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
