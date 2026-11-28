import crypto from 'node:crypto';
import type { VercelResponse } from '@vercel/node';
import { securityHeaders, cors, requestLogger, csrfProtection, compose, getClientIp } from '../lib/middleware/security';
import { requireAuth, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { rateLimit } from '../lib/middleware/rateLimit';
import prisma from '../utils/db';
import {
  JobDomainError,
  cancelGenerationJob,
  createGenerationJob,
  getSanitizedJobStatus,
  processGenerationJobStep,
  recoverStalledJobs
} from '../lib/jobs/generationJobService';

export const maxDuration = 60;

function timingSafeMatch(expected?: string, provided?: string): boolean {
  if (typeof expected !== 'string' || typeof provided !== 'string') return false;
  if (expected.length === 0 || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(provided).digest();
  return crypto.timingSafeEqual(a, b);
}

export function hasValidWorkerSecret(req: AuthenticatedRequest): boolean {
  const provided = req.headers['x-worker-secret'];
  if (typeof provided !== 'string' || !provided) {
    return false;
  }

  const primary = process.env.WORKER_SECRET?.trim() || '';
  const previous = process.env.WORKER_SECRET_PREVIOUS?.trim() || '';

  const matchesPrimary = timingSafeMatch(primary, provided);
  const matchesPrevious = timingSafeMatch(previous, provided);
  return matchesPrimary || matchesPrevious;
}

export function hasValidCronSecret(req: AuthenticatedRequest): boolean {
  const authHeader = req.headers.authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  return timingSafeMatch(process.env.CRON_SECRET?.trim(), bearer);
}

const workerRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 120,
  keyPrefix: 'generation-jobs-worker',
});

const cronRecoverRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: 'generation-jobs-recover',
});

const generationJobsRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 60,
  keyPrefix: 'generation-jobs',
});

async function handler(req: AuthenticatedRequest, res: VercelResponse) {
  const rawAction = req.query?.action;
  if (rawAction !== undefined && typeof rawAction !== 'string') {
    return res.status(400).json({ error: 'Invalid action query parameter' });
  }
  const action = typeof rawAction === 'string' ? rawAction.toLowerCase() : undefined;

  const rawId = req.query?.id;
  if (rawId !== undefined && typeof rawId !== 'string') {
    return res.status(400).json({ error: 'Invalid id query parameter' });
  }
  const jobId = typeof rawId === 'string' ? rawId.trim() : undefined;

  if (action === 'recover') {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!hasValidCronSecret(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = await recoverStalledJobs(process.env.GEMINI_API_KEY);
    return res.status(200).json(result);
  }

  if (action === 'worker') {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!hasValidWorkerSecret(req)) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing worker secret' });
    }
    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server' });
    }

    try {
      const result = await processGenerationJobStep({ jobId, geminiApiKey });
      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof JobDomainError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  // All customer-facing job endpoints require normal authenticated user session (never worker secret)
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const orgId = req.user?.organizationId;
  if (!orgId || !orgId.trim()) {
    return res.status(403).json({ error: 'Forbidden', message: 'Organization context required' });
  }

  try {
    if (req.method === 'GET' && action === 'credits') {
      const bal = await prisma.userCreditBalance.findUnique({
        where: { userId },
        select: { availableTokens: true, reservedTokens: true, updatedAt: true }
      });
      return res.status(200).json({
        credits: {
          availableTokens: bal?.availableTokens ?? 0,
          reservedTokens: bal?.reservedTokens ?? 0,
          updatedAt: bal?.updatedAt ?? null
        }
      });
    }

    if (req.method === 'GET' && jobId) {
      const status = await getSanitizedJobStatus(jobId, userId);
      return res.status(200).json({ job: status });
    }

    if (req.method === 'DELETE' && jobId) {
      if (req.user?.role === 'viewer') {
        return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot cancel jobs' });
      }
      await cancelGenerationJob(jobId, userId, {
        orgId,
        ipAddress: getClientIp(req),
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
      });
      return res.status(200).json({ success: true, status: 'CANCELLED' });
    }

    if (req.method === 'GET') {
      const jobs = await prisma.generationJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          status: true,
          requestedCount: true,
          acceptedCount: true,
          rejectedCount: true,
          retryCount: true,
          maxRetries: true,
          selectedFramework: true,
          frameworkVersion: true,
          selectedTacticId: true,
          selectedTacticName: true,
          createdAt: true,
          completedAt: true
        }
      });

      return res.status(200).json({
        jobs: jobs.map(j => ({
          ...j,
          remainingCount: Math.max(0, j.requestedCount - j.acceptedCount)
        }))
      });
    }

    if (req.method === 'POST') {
      if (req.user?.role === 'viewer') {
        return res.status(403).json({ error: 'Forbidden', message: 'Viewers cannot create generation jobs' });
      }
      const body = req.body as {
        requestedCount?: number;
        selectedFramework?: string;
        frameworkVersion?: string;
        selectedTacticId?: string;
        selectedTacticName?: string;
        selectedVectors?: string[];
        selectedAttacks?: string[];
        objectives?: string;
        idempotencyKey?: string;
      };

      if (
        typeof body?.selectedFramework !== 'string' || !body.selectedFramework.trim() || body.selectedFramework.length > 120 ||
        typeof body?.selectedTacticId !== 'string' || !body.selectedTacticId.trim() || body.selectedTacticId.length > 100 ||
        typeof body?.selectedTacticName !== 'string' || !body.selectedTacticName.trim() || body.selectedTacticName.length > 200 ||
        typeof body?.requestedCount !== 'number'
      ) {
        return res.status(400).json({ error: 'Missing or invalid required job parameters' });
      }

      if (body.objectives !== undefined && (typeof body.objectives !== 'string' || body.objectives.length > 2000)) {
        return res.status(400).json({ error: 'objectives must be a string <= 2000 characters' });
      }

      const selectedVectors = Array.isArray(body.selectedVectors)
        ? body.selectedVectors.filter((v): v is string => typeof v === 'string').slice(0, 50)
        : [];
      const selectedAttacks = Array.isArray(body.selectedAttacks)
        ? body.selectedAttacks.filter((a): a is string => typeof a === 'string').slice(0, 50)
        : [];
      const idempotencyKey =
        typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
          ? body.idempotencyKey.trim().slice(0, 128)
          : crypto.randomUUID();

      const job = await createGenerationJob({
        userId,
        requestedCount: body.requestedCount,
        selectedFramework: body.selectedFramework.trim(),
        frameworkVersion: typeof body.frameworkVersion === 'string' && body.frameworkVersion.trim() ? body.frameworkVersion.trim().slice(0, 40) : '2026',
        selectedTacticId: body.selectedTacticId.trim(),
        selectedTacticName: body.selectedTacticName.trim(),
        selectedVectors,
        selectedAttacks,
        objectives: body.objectives,
        idempotencyKey,
        auditContext: {
          orgId,
          ipAddress: getClientIp(req),
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
        }
      });

      // Decoupled job creation: return job ID and initial PENDING status promptly
      // without synchronously waiting for Gemini generation.
      return res.status(201).json({
        job: {
          id: job.id,
          status: job.status,
          requestedCount: job.requestedCount,
          acceptedCount: job.acceptedCount,
          rejectedCount: job.rejectedCount,
          remainingCount: Math.max(0, job.requestedCount - job.acceptedCount),
          createdAt: job.createdAt
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof JobDomainError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    throw err;
  }
}

export default async function (req: AuthenticatedRequest, res: VercelResponse) {
  const rawAction = req.query?.action;
  if (rawAction !== undefined && typeof rawAction !== 'string') {
    const middleware = compose(securityHeaders, requestLogger);
    await middleware(req, res, async () => {
      res.status(400).json({ error: 'Invalid action query parameter' });
    });
    return;
  }
  const action = typeof rawAction === 'string' ? rawAction.toLowerCase() : undefined;

  if (action === 'recover') {
    const middleware = compose(securityHeaders, requestLogger, cronRecoverRateLimit);
    await middleware(req, res, async () => {
      await catchAsync(handler)(req, res);
    });
    return;
  }

  if (action === 'worker') {
    const middleware = compose(securityHeaders, requestLogger, workerRateLimit);
    await middleware(req, res, async () => {
      await catchAsync(handler)(req, res);
    });
    return;
  }

  const middleware = compose(
    securityHeaders,
    cors({ origin: (process.env.ALLOWED_ORIGINS?.split(',') || []).map(o => o.trim()).filter(Boolean), credentials: true }),
    requestLogger,
    generationJobsRateLimit,
    requireAuth,
    csrfProtection
  );

  await middleware(req, res, async () => {
    await catchAsync(handler)(req, res);
  });
}
