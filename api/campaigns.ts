// API endpoint for campaign operations
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CampaignRepository } from '../repositories/campaignRepository';
import { AuditLogRepository } from '../repositories/auditLogRepository';
// Security middleware is in the existing codebase at api/middleware/security.ts
import { securityHeaders, cors, requestLogger, compose } from './middleware/security';

// GET /api/campaigns - Get all campaigns or single campaign by id
// POST /api/campaigns - Create a new campaign
// PUT /api/campaigns - Update a campaign
// DELETE /api/campaigns - Delete a campaign

const handler = async (req: VercelRequest, res: VercelResponse) => {
  try {
    const method = req.method;

    switch (method) {
      case 'GET': {
        const { id, userId, search } = req.query;

        if (id) {
          const campaign = await CampaignRepository.findById(id as string);
          return res.status(200).json({ campaign });
        }

        if (search) {
          const campaigns = await CampaignRepository.search(search as string, userId as string);
          return res.status(200).json({ campaigns });
        }

        if (userId) {
          const campaigns = await CampaignRepository.findByUserId(userId as string);
          return res.status(200).json({ campaigns });
        }

        const campaigns = await CampaignRepository.findAll();
        return res.status(200).json({ campaigns });
      }

      case 'POST': {
        const { 
          name, 
          description, 
          framework, 
          tacticId, 
          tacticName, 
          createdBy,
          selectedVectors,
          selectedPayloadIndices,
          metadata
        } = req.body;

        if (!name || !framework || !tacticId || !tacticName || !createdBy) {
          return res.status(400).json({ 
            error: 'Missing required fields: name, framework, tacticId, tacticName, createdBy' 
          });
        }

        const campaign = await CampaignRepository.create({
          name,
          description,
          framework,
          tacticId,
          tacticName,
          createdBy,
          selectedVectors,
          selectedPayloadIndices,
          metadata,
        });

        // Log campaign creation
        await AuditLogRepository.create({
          actorId: createdBy,
          action: 'campaign_created',
          target: campaign.id,
          details: { name, framework, tacticId },
        });

        return res.status(201).json({ campaign });
      }

      case 'PUT': {
        const { id, ...updates } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Missing required field: id' });
        }

        const campaign = await CampaignRepository.update(id, updates);

        // Log campaign update
        if (campaign) {
          await AuditLogRepository.create({
            actorId: campaign.createdBy,
            action: 'campaign_updated',
            target: campaign.id,
            details: updates,
          });
        }

        return res.status(200).json({ campaign });
      }

      case 'DELETE': {
        const { id, userId } = req.query;

        if (!id) {
          return res.status(400).json({ error: 'Missing required parameter: id' });
        }

        await CampaignRepository.delete(id as string);

        // Log campaign deletion
        if (userId) {
          await AuditLogRepository.create({
            actorId: userId as string,
            action: 'campaign_deleted',
            target: id as string,
            details: {},
          });
        }

        return res.status(200).json({ message: 'Campaign deleted successfully' });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Campaign API error:', error);
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
