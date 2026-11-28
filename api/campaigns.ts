// API endpoint for campaign operations
import type { VercelResponse } from '@vercel/node';
import { CampaignRepository } from '../repositories/campaignRepository';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import prisma from '../utils/db';
import { securityHeaders, cors, requestLogger, csrfProtection, compose, getClientIp } from '../lib/middleware/security';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logger';
import { rateLimit } from '../lib/middleware/rateLimit';

const campaignsRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 60,
  keyPrefix: 'campaigns',
  message: 'Too many requests from this IP, please try again later.',
});

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
    if (!authUser.organizationId || !authUser.organizationId.trim()) {
      return res.status(403).json({ error: 'Forbidden', message: 'Organization context required' });
    }
    const isAdmin = authUser.role === 'admin';
    const method = req.method;

    switch (method) {
      case 'GET': {
        const { id, userId, search } = req.query || {};
        const orgId = authUser.organizationId;

        if (id !== undefined && (typeof id !== 'string' || !id.trim())) {
          return res.status(400).json({ error: 'Invalid query parameter: id' });
        }
        if (userId !== undefined && (typeof userId !== 'string' || !userId.trim())) {
          return res.status(400).json({ error: 'Invalid query parameter: userId' });
        }
        if (search !== undefined && typeof search !== 'string') {
          return res.status(400).json({ error: 'Invalid query parameter: search' });
        }

        const idParam = typeof id === 'string' ? id : undefined;
        const userIdParam = typeof userId === 'string' ? userId : undefined;
        const searchParam = typeof search === 'string' ? search : undefined;

        const scopedUserId = isAdmin
          ? (userIdParam || undefined)
          : authUser.userId;

        if (idParam) {
          const campaign = await CampaignRepository.findById(idParam, orgId);
          if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
          }
          if (!isAdmin && campaign.createdBy !== authUser.userId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          return res.status(200).json({ campaign });
        }

        if (searchParam) {
          const campaigns = await CampaignRepository.search(searchParam, orgId, scopedUserId);
          return res.status(200).json({ campaigns });
        }

        const campaigns = isAdmin && !userIdParam
          ? await CampaignRepository.findAll({ orgId })
          : await CampaignRepository.findByUserId(scopedUserId!, orgId);
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

        const campaign = await prisma.$transaction(async (tx) => {
          const created = await CampaignRepository.create(
            {
              name,
              description,
              framework,
              tacticId,
              tacticName,
              createdBy: authUser.userId,
              selectedVectors,
              selectedPayloadIndices,
              metadata,
            },
            tx
          );

          await AuditLogRepository.create(
            {
              orgId: authUser.organizationId!,
              actorId: authUser.userId,
              action: 'campaign_created',
              target: created.id,
              details: { name, framework, tacticId },
              ipAddress: getClientIp(req),
              userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
            },
            tx
          );

          return created;
        });

        return res.status(201).json({ campaign });
      }

      case 'PUT': {
        if (authUser.role === 'viewer') {
          return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot modify campaigns' });
        }
        const { id, name, description, status, selectedVectors, selectedPayloadIndices, metadata } = req.body || {};

        if (!id || typeof id !== 'string' || !id.trim()) {
          return res.status(400).json({ error: 'Missing required field: id' });
        }

        const orgId = authUser.organizationId;
        const existing = await CampaignRepository.findById(id, orgId);
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

        const campaign = await prisma.$transaction(async (tx) => {
          const updated = await CampaignRepository.update(
            id,
            orgId,
            updates as Parameters<typeof CampaignRepository.update>[2],
            tx
          );
          if (!updated) {
            return null;
          }

          await AuditLogRepository.create(
            {
              orgId: authUser.organizationId!,
              actorId: authUser.userId,
              action: 'campaign_updated',
              target: updated.id,
              details: updates as Parameters<typeof AuditLogRepository.create>[0]['details'],
              ipAddress: getClientIp(req),
              userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
            },
            tx
          );

          return updated;
        });
        if (!campaign) {
          return res.status(404).json({ error: 'Campaign not found' });
        }

        return res.status(200).json({ campaign });
      }

      case 'DELETE': {
        if (authUser.role === 'viewer') {
          return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot delete campaigns' });
        }
        const { id } = req.query || {};

        if (!id || typeof id !== 'string' || !id.trim()) {
          return res.status(400).json({ error: 'Missing required parameter: id' });
        }

        const orgId = authUser.organizationId;
        const existing = await CampaignRepository.findById(id, orgId);
        if (!existing) {
          return res.status(404).json({ error: 'Campaign not found' });
        }
        if (!isAdmin && existing.createdBy !== authUser.userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const deleted = await prisma.$transaction(async (tx) => {
          const removed = await CampaignRepository.delete(id, orgId, tx);
          if (!removed) {
            return false;
          }

          await AuditLogRepository.create(
            {
              orgId: authUser.organizationId!,
              actorId: authUser.userId,
              action: 'campaign_deleted',
              target: id,
              details: {},
              ipAddress: getClientIp(req),
              userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
            },
            tx
          );

          return true;
        });
        if (!deleted) {
          return res.status(404).json({ error: 'Campaign not found' });
        }

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
    campaignsRateLimit,
    requireAuth,
    csrfProtection
  );

  await middleware(req, res, async () => {
    await catchAsync(handler)(req, res);
  });
}
