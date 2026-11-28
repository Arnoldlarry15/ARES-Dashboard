// API endpoint for audit log operations
import type { VercelResponse } from '@vercel/node';
import type { Prisma } from '@prisma/client';
import { AuditLogRepository, type AuditLogFilter } from '../repositories/auditLogRepository';
import { securityHeaders, cors, requestLogger, csrfProtection, compose, getClientIp } from '../lib/middleware/security';
import { requireAuth, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logger';
import { rateLimit } from '../lib/middleware/rateLimit';

const auditLogsRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 60,
  keyPrefix: 'audit-logs',
  message: 'Too many requests from this IP, please try again later.',
});

const ALLOWED_CLIENT_AUDIT_ACTIONS = new Set(['ui_view', 'ui_export']);
const MAX_CLIENT_DETAILS_BYTES = 4096;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// GET /api/audit-logs - Get audit logs (admins/red_team_lead can filter; analysts see only their own)
// POST /api/audit-logs - Append a client-telemetry audit log entry for the authenticated actor

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    if (!authUser.organizationId || !authUser.organizationId.trim()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Organization context required' });
    }
    const isPrivileged = authUser.role === 'admin' || authUser.role === 'red_team_lead';
    const method = req.method;

    switch (method) {
      case 'GET': {
        const { actorId, action, startDate, endDate, skip, take } = req.query;

        const filter: AuditLogFilter = {
          orgId: authUser.organizationId,
        };

        if (actorId !== undefined) {
          if (typeof actorId !== 'string') {
            return res.status(400).json({ error: 'Invalid actorId' });
          }
          if (!isPrivileged && actorId !== authUser.userId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          filter.actorId = actorId;
        } else if (!isPrivileged) {
          filter.actorId = authUser.userId;
        }

        if (action !== undefined) {
          if (typeof action !== 'string') {
            return res.status(400).json({ error: 'Invalid action' });
          }
          if (action) {
            filter.action = action;
          }
        }

        if (startDate !== undefined) {
          if (typeof startDate !== 'string') {
            return res.status(400).json({ error: 'Invalid startDate' });
          }
          const parsedStart = new Date(startDate);
          if (Number.isNaN(parsedStart.getTime())) {
            return res.status(400).json({ error: 'Invalid startDate' });
          }
          filter.startDate = parsedStart;
        }

        if (endDate !== undefined) {
          if (typeof endDate !== 'string') {
            return res.status(400).json({ error: 'Invalid endDate' });
          }
          const parsedEnd = new Date(endDate);
          if (Number.isNaN(parsedEnd.getTime())) {
            return res.status(400).json({ error: 'Invalid endDate' });
          }
          filter.endDate = parsedEnd;
        }

        const options: { skip?: number; take?: number } = { take: 50 };
        if (skip !== undefined) {
          if (typeof skip !== 'string') {
            return res.status(400).json({ error: 'Invalid skip parameter' });
          }
          const parsedSkip = parseInt(skip, 10);
          if (Number.isNaN(parsedSkip) || parsedSkip < 0) {
            return res.status(400).json({ error: 'Invalid skip parameter' });
          }
          options.skip = parsedSkip;
        }
        if (take !== undefined) {
          if (typeof take !== 'string') {
            return res.status(400).json({ error: 'Invalid take parameter' });
          }
          const parsedTake = parseInt(take, 10);
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

        const body = isPlainObject(req.body) ? req.body : {};
        const { action, target, details } = body;

        if (
          typeof action !== 'string' || !action.trim() || action.length > 100 ||
          typeof target !== 'string' || !target.trim() || target.length > 200
        ) {
          return res.status(400).json({
            error: 'Missing or invalid required fields: action, target'
          });
        }

        const normalizedAction = action.trim();
        if (!ALLOWED_CLIENT_AUDIT_ACTIONS.has(normalizedAction)) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Action is not permitted for client-submitted audit logs'
          });
        }

        let sanitizedDetails: Prisma.InputJsonValue | undefined;
        if (details !== undefined) {
          if (!isPlainObject(details)) {
            return res.status(400).json({ error: 'Invalid details: must be a plain object' });
          }
          let serialized: string;
          try {
            serialized = JSON.stringify(details);
          } catch {
            return res.status(400).json({ error: 'Invalid details: must be JSON-serializable' });
          }
          if (Buffer.byteLength(serialized, 'utf8') > MAX_CLIENT_DETAILS_BYTES) {
            return res.status(400).json({
              error: `Invalid details: serialized size exceeds ${MAX_CLIENT_DETAILS_BYTES} bytes`
            });
          }
          sanitizedDetails = JSON.parse(serialized) as Prisma.InputJsonValue;
        }

        const serverIp = getClientIp(req);
        const serverUserAgent =
          typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : undefined;

        const auditLog = await AuditLogRepository.create({
          orgId: authUser.organizationId,
          actorId: authUser.userId,
          action: normalizedAction,
          target: target.trim(),
          details: sanitizedDetails,
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
    auditLogsRateLimit,
    requireAuth,
    csrfProtection
  );

  await middleware(req, res, async () => {
    await catchAsync(handler)(req, res);
  });
}
