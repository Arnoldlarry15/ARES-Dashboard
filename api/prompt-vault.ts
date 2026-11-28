import type { VercelResponse } from '@vercel/node';
import type { Prisma } from '@prisma/client';
import { securityHeaders, cors, requestLogger, csrfProtection, compose, getClientIp } from '../lib/middleware/security';
import { requireAuth, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { rateLimit } from '../lib/middleware/rateLimit';
import prisma from '../utils/db';
import { JobDomainError, reportDeliveredDuplicate } from '../lib/jobs/generationJobService';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import { logger } from '../lib/logger';

const promptVaultRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: 'prompt-vault',
});

async function emitPromptVaultAuditLog(
  req: AuthenticatedRequest,
  orgId: string,
  actorId: string,
  action: string,
  target: string,
  details: Prisma.InputJsonValue
): Promise<void> {
  try {
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : undefined;
    await AuditLogRepository.create({
      orgId,
      actorId,
      action,
      target,
      details,
      ipAddress: getClientIp(req),
      userAgent,
    });
  } catch (err) {
    if (process.env.DATABASE_URL) {
      throw err;
    }
    logger.warn('Failed to emit prompt vault audit log', {
      action,
      target,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const authUser = req.user;
  const userId = authUser?.userId;
  if (!authUser || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!authUser.organizationId || !authUser.organizationId.trim()) {
    return res.status(403).json({ error: 'Forbidden', message: 'Organization context required' });
  }
  const orgId = authUser.organizationId;

  if (req.method === 'GET') {
    const rawLimit = Number(req.query.limit ?? 100);
    const take = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 100;
    const items = await prisma.customerPromptVault.findMany({
      where: { userId },
      orderBy: { acquiredAt: 'desc' },
      take,
      include: {
        registryPrompt: {
          select: {
            id: true,
            framework: true,
            frameworkVersion: true,
            attackVector: true,
            attackName: true,
            payload: true,
            createdAt: true
          }
        }
      }
    });

    await emitPromptVaultAuditLog(req, orgId, userId, 'prompt_vault_read', userId, {
      count: items.length,
      take,
    });

    return res.status(200).json({
      prompts: items.map(item => ({
        vaultId: item.id,
        jobId: item.jobId,
        registryPromptId: item.registryPromptId,
        isDuplicateReported: item.isDuplicateReported,
        replacedByVaultId: item.replacedByVaultId,
        acquiredAt: item.acquiredAt,
        framework: item.registryPrompt.framework,
        frameworkVersion: item.registryPrompt.frameworkVersion,
        attackVector: item.registryPrompt.attackVector,
        attackName: item.registryPrompt.attackName,
        payload: item.registryPrompt.payload
      }))
    });
  }

  if (req.method === 'POST' && req.query.action === 'report-duplicate') {
    if (authUser.role === 'viewer') {
      return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot report duplicates' });
    }
    const vaultItemId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!vaultItemId || !reason || reason.length > 1000) {
      return res.status(400).json({ error: 'Valid vault item ID and reason (<= 1000 chars) are required' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured for duplicate investigation' });
    }

    try {
      const userAgent =
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : undefined;
      const result = await reportDeliveredDuplicate({
        userId,
        vaultItemId,
        reason,
        geminiApiKey,
        auditContext: {
          orgId,
          ipAddress: getClientIp(req),
          userAgent,
        },
      });

      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof JobDomainError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default async function (req: AuthenticatedRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors({ origin: (process.env.ALLOWED_ORIGINS?.split(',') || []).map(o => o.trim()).filter(Boolean), credentials: true }),
    requestLogger,
    promptVaultRateLimit,
    requireAuth,
    csrfProtection
  );

  await middleware(req, res, async () => {
    await catchAsync(handler)(req, res);
  });
}
