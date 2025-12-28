// API endpoint for campaign export operations
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CampaignRepository } from '../repositories/campaignRepository';
import { auditFromRequest } from '../utils/audit';
import { securityHeaders, cors, requestLogger, compose } from './middleware/security';
import { requireAuth, type AuthenticatedRequest } from './middleware/auth';

// GET /api/export-campaigns - Export campaigns as JSON
// Requires authentication for security tracking

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  try {
    const method = req.method;

    if (method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { format = 'json' } = req.query;

    // Get campaigns for authenticated user
    const campaigns = await CampaignRepository.findByUserId(req.user!.userId);

    // Log export action (user is guaranteed by requireAuth middleware)
    await auditFromRequest(
      req,
      req.user!.userId,
      'export_campaigns',
      'campaigns',
      { 
        format,
        count: campaigns.length,
        userId: req.user!.userId
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
  // Require authentication to prevent anonymous access
  const middleware = compose(
    securityHeaders,
    cors(),
    requestLogger,
    requireAuth
  );

  middleware(req, res, async () => {
    await handler(req as AuthenticatedRequest, res);
  });
}
