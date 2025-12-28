// API endpoint for data retention and cleanup operations
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cleanupAuditLogs, getRetentionStats } from '../utils/dataRetention';
import { auditFromRequest } from '../utils/audit';
import { securityHeaders, cors, requestLogger, compose } from './middleware/security';
import { requireAuth, requireRole, type AuthenticatedRequest } from './middleware/auth';

// POST /api/data-retention - Trigger cleanup of old audit logs (admin only)
// GET /api/data-retention - Get retention statistics (admin only)

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  try {
    const method = req.method;

    switch (method) {
      case 'GET': {
        // Get retention statistics
        const stats = await getRetentionStats();
        
        // Log access to retention stats
        if (req.user) {
          await auditFromRequest(
            req,
            req.user.userId,
            'retention_stats_viewed',
            'audit_logs',
            { stats }
          );
        }

        return res.status(200).json(stats);
      }

      case 'POST': {
        // Trigger audit log cleanup
        const { action } = req.body;

        if (action !== 'cleanup') {
          return res.status(400).json({ 
            error: 'Invalid action. Use "cleanup" to trigger retention cleanup.' 
          });
        }

        const deletedCount = await cleanupAuditLogs();

        // Log cleanup action
        if (req.user) {
          await auditFromRequest(
            req,
            req.user.userId,
            'audit_cleanup_executed',
            'audit_logs',
            { deletedCount }
          );
        }

        return res.status(200).json({ 
          message: 'Audit log cleanup completed',
          deletedCount 
        });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Data retention API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: (error as Error).message 
    });
  }
};

export default async function (req: VercelRequest, res: VercelResponse) {
  // Apply middleware - require authentication and admin role
  const middleware = compose(
    securityHeaders,
    cors(),
    requestLogger,
    requireAuth,
    requireRole(['admin'])
  );

  middleware(req, res, async () => {
    await handler(req as AuthenticatedRequest, res);
  });
}
