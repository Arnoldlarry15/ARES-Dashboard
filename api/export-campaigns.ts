// API endpoint for campaign export operations
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CampaignRepository } from '../repositories/campaignRepository';
import { auditFromRequest } from '../utils/audit';
import { securityHeaders, cors, requestLogger, compose } from './middleware/security';
import { optionalAuth, type AuthenticatedRequest } from './middleware/auth';

// GET /api/export-campaigns - Export campaigns as JSON
// Requires authentication if available for user-specific exports

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  try {
    const method = req.method;

    if (method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId, format = 'json' } = req.query;

    // Get campaigns based on user context
    let campaigns;
    if (userId) {
      campaigns = await CampaignRepository.findByUserId(userId as string);
    } else if (req.user) {
      campaigns = await CampaignRepository.findByUserId(req.user.userId);
    } else {
      campaigns = await CampaignRepository.findAll();
    }

    // Log export action
    const actorId = req.user?.userId || userId || 'anonymous';
    await auditFromRequest(
      req,
      actorId as string,
      'export_campaigns',
      'campaigns',
      { 
        format,
        count: campaigns.length,
        userId: userId || req.user?.userId
      }
    );

    // Return campaigns as JSON
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="campaigns-export.json"');
      return res.status(200).json(campaigns);
    }

    // Default to JSON if unsupported format
    return res.status(200).json(campaigns);
  } catch (error) {
    console.error('Campaign export API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: (error as Error).message 
    });
  }
};

export default async function (req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors(),
    requestLogger,
    optionalAuth
  );

  middleware(req, res, async () => {
    await handler(req as AuthenticatedRequest, res);
  });
}
