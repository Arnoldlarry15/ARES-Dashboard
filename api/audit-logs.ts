// API endpoint for audit log operations
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuditLogRepository } from '../repositories/auditLogRepository';
// Security middleware is in the existing codebase at api/middleware/security.ts
import { securityHeaders, cors, requestLogger, compose } from './middleware/security';

// GET /api/audit-logs - Get audit logs with optional filters
// POST /api/audit-logs - Create a new audit log entry

const handler = async (req: VercelRequest, res: VercelResponse) => {
  try {
    const method = req.method;

    switch (method) {
      case 'GET': {
        const { actorId, action, startDate, endDate, skip, take } = req.query;

        const filter: any = {};
        if (actorId) filter.actorId = actorId;
        if (action) filter.action = action;
        if (startDate) filter.startDate = new Date(startDate as string);
        if (endDate) filter.endDate = new Date(endDate as string);

        const options: any = {};
        if (skip) options.skip = parseInt(skip as string);
        if (take) options.take = parseInt(take as string);

        const auditLogs = await AuditLogRepository.findMany(filter, options);
        const count = await AuditLogRepository.count(filter);

        return res.status(200).json({ auditLogs, count });
      }

      case 'POST': {
        const { actorId, action, target, details, ipAddress, userAgent } = req.body;

        if (!actorId || !action || !target) {
          return res.status(400).json({ 
            error: 'Missing required fields: actorId, action, target' 
          });
        }

        const auditLog = await AuditLogRepository.create({
          actorId,
          action,
          target,
          details,
          ipAddress,
          userAgent,
        });

        return res.status(201).json({ auditLog });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Audit log API error:', error);
    return res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
};

export default async function (req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors(),
    requestLogger
  );

  middleware(req, res, async () => {
    await handler(req, res);
  });
}
