// API endpoint for campaign operations
import type { VercelResponse } from '@vercel/node';
import { CampaignRepository } from '../repositories/campaignRepository';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import { securityHeaders, cors, requestLogger, csrfProtection, compose } from '../lib/middleware/security';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logger';
import { limiter } from '../lib/middleware/rateLimit';

// GET /api/campaigns - Get all campaigns or single campaign by id
// POST /api/campaigns - Create a new campaign
// PUT /api/campaigns - Update a campaign
// DELETE /api/campaigns - Delete a campaign

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
        const { id, userId, search } = req.query;
        const scopedUserId = isAdmin && userId ? (userId as string) : authUser.userId;

        if (id) {
          const campaign = await CampaignRepository.findById(id as string);
          if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
          }
          if (!isAdmin && campaign.createdBy !== authUser.userId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          return res.status(200).json({ campaign });
        }

        if (search) {
          const campaigns = await CampaignRepository.search(search as string, scopedUserId);
          return res.status(200).json({ campaigns });
        }

        const campaigns = isAdmin && !userId
          ? await CampaignRepository.findAll()
          : await CampaignRepository.findByUserId(scopedUserId);
        return res.status(200).json({ campaigns });
      }

      case 'POST': {
        if (authUser.role === 'viewer') {
          return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot create campaigns' });
        }
        const {
          name,
          description,
          framework,
          tacticId,
          tacticName,
          selectedVectors,
          selectedPayloadIndices,
          metadata
        } = req.body;

        if (typeof name !== 'string' || !name.trim() || name.length > 200 ||
            typeof framework !== 'string' || !framework.trim() ||
            typeof tacticId !== 'string' || !tacticId.trim() ||
            typeof tacticName !== 'string' || !tacticName.trim()) {
          return res.status(400).json({
            error: 'Missing or invalid required fields: name, framework, tacticId, tacticName'
          });
        }

        const campaign = await CampaignRepository.create({
          name,
          description,
          framework,
          tacticId,
          tacticName,
          createdBy: authUser.userId,
          selectedVectors,
          selectedPayloadIndices,
          metadata,
        });

        await AuditLogRepository.create({
          actorId: authUser.userId,
          action: 'campaign_created',
          target: campaign.id,
          details: { name, framework, tacticId },
        });

        return res.status(201).json({ campaign });
      }

      case 'PUT': {
        if (authUser.role === 'viewer') {
          return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot modify campaigns' });
        }
        const { id, name, description, status, selectedVectors, selectedPayloadIndices, metadata } = req.body;

        if (!id || typeof id !== 'string') {
          return res.status(400).json({ error: 'Missing required field: id' });
        }

        const existing = await CampaignRepository.findById(id);
        if (!existing) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        if (!isAdmin && existing.createdBy !== authUser.userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const updates: Record<string, unknown> = {};
        if (typeof name === 'string') updates.name = name;
        if (typeof description === 'string') updates.description = description;
        if (typeof status === 'string') updates.status = status;
        if (Array.isArray(selectedVectors)) updates.selectedVectors = selectedVectors;
        if (Array.isArray(selectedPayloadIndices)) updates.selectedPayloadIndices = selectedPayloadIndices;
        if (metadata && typeof metadata === 'object') updates.metadata = metadata as object;

        const campaign = await CampaignRepository.update(id, updates as Parameters<typeof CampaignRepository.update>[1]);

        if (campaign) {
          await AuditLogRepository.create({
            actorId: authUser.userId,
            action: 'campaign_updated',
            target: campaign.id,
            details: updates as Parameters<typeof AuditLogRepository.create>[0]['details'],
          });
        }

        return res.status(200).json({ campaign });
      }

      case 'DELETE': {
        if (authUser.role === 'viewer') {
          return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot delete campaigns' });
        }
        const { id } = req.query;

        if (!id) {
          return res.status(400).json({ error: 'Missing required parameter: id' });
        }

        const existing = await CampaignRepository.findById(id as string);
        if (!existing) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        if (!isAdmin && existing.createdBy !== authUser.userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        await CampaignRepository.delete(id as string);

        await AuditLogRepository.create({
          actorId: authUser.userId,
          action: 'campaign_deleted',
          target: id as string,
          details: {},
        });

        return res.status(200).json({ message: 'Campaign deleted successfully' });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('Campaign API error', error as Error, {
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
