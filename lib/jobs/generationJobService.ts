import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { GoogleGenAI, Type } from '@google/genai';
import prisma from '../../utils/db';
import { AuditLogRepository } from '../../repositories/auditLogRepository';
import type { AttackPayload } from '../../types';
import { buildSingleCandidatePrompt } from '../ai/tacticGeneration';
import { evaluateCandidateIndependently } from '../ai/candidateEvaluator';
import {
  acceptCandidateIntoRegistryWithLock,
  checkOriginalityAgainstRegistry
} from '../originality/originalityService';

export const PACKAGE_CREDIT_MAP: Record<number, number> = {
  4: 1,
  12: 3,
  28: 7,
  40: 10
};

const DEFAULT_LEASE_TTL_MS = 45_000;
const WORKER_STEP_BUDGET_MS = Number(process.env.ARES_WORKER_STEP_BUDGET_MS || 8_500);
const MAX_CANDIDATES_PER_STEP = Number(process.env.ARES_CANDIDATES_PER_STEP || 1);
const MAX_RECOVERY_JOBS_PER_RUN = Number(process.env.ARES_MAX_RECOVERY_JOBS || 3);
const RECOVERY_BUDGET_MS = Number(process.env.ARES_RECOVERY_BUDGET_MS || 8_500);

const GEN_INPUT_USD_PER_M = Number(process.env.ARES_GEN_INPUT_USD_PER_M || 0.15);
const GEN_OUTPUT_USD_PER_M = Number(process.env.ARES_GEN_OUTPUT_USD_PER_M || 0.60);
const EVAL_INPUT_USD_PER_M = Number(process.env.ARES_EVAL_INPUT_USD_PER_M || 0.15);
const EVAL_OUTPUT_USD_PER_M = Number(process.env.ARES_EVAL_OUTPUT_USD_PER_M || 0.60);
const EMBED_USD_PER_M = Number(process.env.ARES_EMBED_USD_PER_M || 0.02);

export function estimateAttemptCostUsd(params: {
  generatorInputTokens?: number;
  generatorOutputTokens?: number;
  evaluatorInputTokens?: number;
  evaluatorOutputTokens?: number;
  embeddingTokens?: number;
}): number {
  const genCost =
    ((params.generatorInputTokens || 0) / 1_000_000) * GEN_INPUT_USD_PER_M +
    ((params.generatorOutputTokens || 0) / 1_000_000) * GEN_OUTPUT_USD_PER_M;
  const evalCost =
    ((params.evaluatorInputTokens || 0) / 1_000_000) * EVAL_INPUT_USD_PER_M +
    ((params.evaluatorOutputTokens || 0) / 1_000_000) * EVAL_OUTPUT_USD_PER_M;
  const embCost = ((params.embeddingTokens || 0) / 1_000_000) * EMBED_USD_PER_M;
  return Number((genCost + evalCost + embCost).toFixed(8));
}

async function runWithAbortTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          const err = new Error(`${label} exceeded runtime budget (${timeoutMs}ms)`);
          err.name = 'AbortError';
          reject(err);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class JobDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'JobDomainError';
  }
}

export interface JobAuditContext {
  orgId: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function createGenerationJob(params: {
  userId: string;
  requestedCount: number;
  selectedFramework: string;
  frameworkVersion: string;
  selectedTacticId: string;
  selectedTacticName: string;
  selectedVectors: string[];
  selectedAttacks: string[];
  objectives?: string;
  provider?: string;
  credentialMode?: string;
  idempotencyKey: string;
  purchaseOrderId?: string;
  isReplacement?: boolean;
  auditContext?: JobAuditContext;
}) {
  const isReplacement = Boolean(params.isReplacement);
  const requiredCredits = isReplacement ? 0 : PACKAGE_CREDIT_MAP[params.requestedCount];

  if (!isReplacement && requiredCredits === undefined) {
    throw new JobDomainError(
      'Invalid package quantity. Supported packages: 4 (1 credit), 12 (3 credits), 28 (7 credits), 40 (10 credits).',
      'INVALID_PACKAGE_QUANTITY',
      400
    );
  }

  return prisma.$transaction(async (tx) => {
    if (tx.user?.findFirst) {
      const activeUser = await tx.user.findFirst({
        where: { id: params.userId, disabledAt: null },
        select: { id: true }
      });
      if (!activeUser) {
        throw new JobDomainError('Account has been deactivated', 'USER_DEACTIVATED', 403);
      }
    }

    const existing = await tx.generationJob.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: params.userId,
          idempotencyKey: params.idempotencyKey
        }
      }
    });

    if (existing) {
      return existing;
    }

    if (requiredCredits > 0) {
      const reserved = await tx.userCreditBalance.updateMany({
        where: {
          userId: params.userId,
          availableTokens: { gte: requiredCredits }
        },
        data: {
          availableTokens: { decrement: requiredCredits },
          reservedTokens: { increment: requiredCredits }
        }
      });

      if (reserved.count === 0) {
        throw new JobDomainError(
          `Insufficient credits. This package requires ${requiredCredits} credit(s).`,
          'INSUFFICIENT_CREDITS',
          402
        );
      }
    }

    const job = await tx.generationJob.create({
      data: {
        userId: params.userId,
        purchaseOrderId: params.purchaseOrderId,
        status: 'PENDING',
        requestedCount: params.requestedCount,
        reservedCredits: requiredCredits,
        isReplacement,
        selectedFramework: params.selectedFramework,
        frameworkVersion: params.frameworkVersion,
        selectedTacticId: params.selectedTacticId,
        selectedTacticName: params.selectedTacticName,
        selectedVectors: params.selectedVectors,
        selectedAttacks: params.selectedAttacks,
        objectives: params.objectives,
        provider: params.provider || 'gemini',
        credentialMode: params.credentialMode || 'server_managed',
        maxRetries: Math.max(15, params.requestedCount * 2),
        idempotencyKey: params.idempotencyKey
      }
    });

    if (requiredCredits > 0) {
      await tx.creditTransaction.create({
        data: {
          userId: params.userId,
          amount: -requiredCredits,
          type: 'RESERVE',
          jobId: job.id,
          idempotencyKey: `reserve:${params.userId}:${params.idempotencyKey}`
        }
      });
    }

    if (params.auditContext) {
      await AuditLogRepository.create(
        {
          actorId: params.userId,
          orgId: params.auditContext.orgId,
          action: 'generation_job_created',
          target: job.id,
          details: {
            requestedCount: job.requestedCount,
            selectedFramework: params.selectedFramework,
            selectedTacticId: params.selectedTacticId
          },
          ipAddress: params.auditContext.ipAddress,
          userAgent: params.auditContext.userAgent
        },
        tx
      );
    }

    return job;
  });
}

async function generateOneGeminiCandidate(params: {
  apiKey: string;
  framework: string;
  frameworkVersion: string;
  tacticId: string;
  tacticName: string;
  attackVector: string;
  attackName: string;
  objectives?: string;
  attemptNumber: number;
  abortSignal?: AbortSignal;
}): Promise<{ payload: AttackPayload; modelUsed: string; inputTokens: number; outputTokens: number }> {
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const genAI = new GoogleGenAI({ apiKey: params.apiKey });
  const prompt = buildSingleCandidatePrompt({
    framework: params.framework,
    frameworkVersion: params.frameworkVersion,
    tacticId: params.tacticId,
    tacticName: params.tacticName,
    attackVector: params.attackVector,
    attackName: params.attackName,
    objectives: params.objectives,
    attemptNumber: params.attemptNumber
  });

  const response = await genAI.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.85,
      abortSignal: params.abortSignal,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        required: ['description', 'payload', 'format', 'attack_name', 'attack_objective'],
        properties: {
          description: { type: Type.STRING },
          payload: { type: Type.STRING },
          format: { type: Type.STRING },
          attack_name: { type: Type.STRING },
          attack_family: { type: Type.STRING },
          technique: { type: Type.STRING },
          attack_objective: { type: Type.STRING },
          target_behavior: { type: Type.STRING },
          security_boundary: { type: Type.STRING },
          expected_safe_behavior: { type: Type.STRING },
          difficulty_level: { type: Type.STRING },
          owasp_mapping: { type: Type.STRING },
          mitre_atlas_mapping: { type: Type.STRING },
          evaluation_criteria: { type: Type.STRING },
          expected_failure_indicators: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  });

  const parsed = JSON.parse(response.text || '{}') as AttackPayload;
  if (!parsed.payload || !parsed.description) {
    throw new Error('Generator returned incomplete candidate payload');
  }

  const usage = response.usageMetadata;
  return {
    payload: parsed,
    modelUsed: model,
    inputTokens: usage?.promptTokenCount || 0,
    outputTokens: usage?.candidatesTokenCount || 0
  };
}

/**
 * Atomic Package Fulfillment:
 * Only when acceptedCount === requestedCount are prompts copied to CustomerPromptVault,
 * registry statuses finalized, and reserved credits committed.
 */
async function finalizeCompletePackage(jobId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const job = await tx.generationJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'FAILED' || job.status === 'INCOMPLETE') {
      return;
    }

    const acceptedCandidates = await tx.candidateAttempt.findMany({
      where: { jobId, status: 'ACCEPTED_INTERNAL' },
      orderBy: { attemptNumber: 'asc' }
    });

    if (acceptedCandidates.length < job.requestedCount) {
      return;
    }

    // Atomically transition to COMPLETED so concurrent cancellation/release cannot both refund and deliver
    const claimed = await tx.generationJob.updateMany({
      where: {
        id: job.id,
        status: { notIn: ['COMPLETED', 'FAILED', 'INCOMPLETE', 'CANCELLED'] }
      },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        workerLeaseId: null,
        leaseExpiresAt: null
      }
    });
    if (claimed.count === 0) {
      return;
    }

    const packageCandidates = acceptedCandidates.slice(0, job.requestedCount);
    const fingerprints = packageCandidates.map(c => c.sha256Fingerprint);

    const registryRows = await tx.globalPromptRegistry.findMany({
      where: { sha256Fingerprint: { in: fingerprints } }
    });

    if (registryRows.length !== job.requestedCount) {
      throw new Error('Package integrity check failed: missing registry records for accepted candidates');
    }

    for (const reg of registryRows) {
      await tx.globalPromptRegistry.update({
        where: { id: reg.id },
        data: { acceptanceStatus: 'ACCEPTED' }
      });

      await tx.customerPromptVault.upsert({
        where: {
          userId_registryPromptId: {
            userId: job.userId,
            registryPromptId: reg.id
          }
        },
        create: {
          userId: job.userId,
          jobId: job.id,
          registryPromptId: reg.id
        },
        update: {}
      });
    }

    await tx.candidateAttempt.updateMany({
      where: { id: { in: packageCandidates.map(c => c.id) } },
      data: { status: 'DELIVERED' }
    });

    if (job.reservedCredits > 0) {
      const reservedUpdate = await tx.userCreditBalance.updateMany({
        where: {
          userId: job.userId,
          reservedTokens: { gte: job.reservedCredits }
        },
        data: {
          reservedTokens: { decrement: job.reservedCredits }
        }
      });
      if (reservedUpdate.count === 0) {
        throw new Error('Credit reservation integrity check failed during package commit');
      }

      await tx.creditTransaction.create({
        data: {
          userId: job.userId,
          amount: -job.reservedCredits,
          type: 'COMMIT',
          jobId: job.id,
          idempotencyKey: `commit:${job.id}`
        }
      });
    }
  });
}

/**
 * Releases full credit reservation on terminal failure or cancellation.
 * Partially accepted candidates remain internal (ACCEPTED_UNDELIVERED) and are never delivered.
 */
async function releaseJobReservation(
  jobId: string,
  terminalStatus: 'FAILED' | 'INCOMPLETE' | 'CANCELLED',
  errorCode?: string,
  errorMessage?: string,
  auditContext?: JobAuditContext,
  stepUpdates?: {
    acceptedCount?: number;
    rejectedCount?: number;
    retryCount?: number;
    stepCostUsd?: number;
  },
  expectedLeaseId?: string
): Promise<boolean> {
  let didTransition = false;
  await prisma.$transaction(async (tx) => {
    // Row-level atomic state transition prevents concurrent duplicate RELEASE attempts
    const transitioned = await tx.generationJob.updateMany({
      where: {
        id: jobId,
        status: { notIn: ['COMPLETED', 'FAILED', 'INCOMPLETE', 'CANCELLED'] },
        ...(expectedLeaseId ? { workerLeaseId: expectedLeaseId } : {})
      },
      data: {
        status: terminalStatus,
        errorCode,
        errorMessage,
        workerLeaseId: null,
        leaseExpiresAt: null,
        ...(stepUpdates?.acceptedCount !== undefined ? { acceptedCount: stepUpdates.acceptedCount } : {}),
        ...(stepUpdates?.rejectedCount !== undefined ? { rejectedCount: stepUpdates.rejectedCount } : {}),
        ...(stepUpdates?.retryCount !== undefined ? { retryCount: stepUpdates.retryCount } : {}),
        ...(stepUpdates?.stepCostUsd && stepUpdates.stepCostUsd > 0
          ? { totalCostUsd: { increment: stepUpdates.stepCostUsd } }
          : {})
      }
    });

    if (transitioned.count === 0) {
      return;
    }
    didTransition = true;

    const job = await tx.generationJob.findUnique({ where: { id: jobId } });
    if (job && job.reservedCredits > 0) {
      await tx.userCreditBalance.updateMany({
        where: {
          userId: job.userId,
          reservedTokens: { gte: job.reservedCredits }
        },
        data: {
          reservedTokens: { decrement: job.reservedCredits },
          availableTokens: { increment: job.reservedCredits }
        }
      });

      await tx.creditTransaction.create({
        data: {
          userId: job.userId,
          amount: job.reservedCredits,
          type: 'RELEASE',
          jobId: job.id,
          idempotencyKey: `release:${job.id}`
        }
      });
    }

    if (auditContext && terminalStatus === 'CANCELLED' && job) {
      await AuditLogRepository.create(
        {
          actorId: job.userId,
          orgId: auditContext.orgId,
          action: 'generation_job_cancelled',
          target: job.id,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent
        },
        tx
      );
    }
  });
  return didTransition;
}

async function persistDroppedStepCost(jobId: string, stepCostUsd: number): Promise<void> {
  if (stepCostUsd > 0) {
    await prisma.generationJob.updateMany({
      where: { id: jobId },
      data: { totalCostUsd: { increment: stepCostUsd } }
    });
  }
}

async function resolveCurrentJobStepResult(
  jobId: string,
  fallbackStatus: string,
  fallbackAcceptedCount: number,
  requestedCount: number
): Promise<{ status: string; acceptedCount: number; requestedCount: number; hasMoreWork: boolean }> {
  const current = await prisma.generationJob.findUnique({
    where: { id: jobId },
    select: { status: true, acceptedCount: true }
  });
  const status = current?.status ?? fallbackStatus;
  const acceptedCount = current?.acceptedCount ?? fallbackAcceptedCount;
  return {
    status,
    acceptedCount,
    requestedCount,
    hasMoreWork: status === 'PENDING' || status === 'RUNNING'
  };
}

/**
 * Cancels all non-terminal (PENDING / RUNNING) generation jobs for a deactivated user
 * inside an existing Prisma transaction, releasing reserved credits idempotently and
 * preserving any already-accepted work and accrued totalCostUsd.
 */
export async function cancelActiveJobsForUserInTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    orgId: string;
    actorId: string;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<{ cancelledJobIds: string[]; releasedCredits: number }> {
  if (!tx.generationJob?.findMany) {
    return { cancelledJobIds: [], releasedCredits: 0 };
  }
  const activeJobs = await tx.generationJob.findMany({
    where: {
      userId: params.userId,
      status: { in: ['PENDING', 'RUNNING'] }
    },
    orderBy: { createdAt: 'asc' }
  });

  const cancelledJobIds: string[] = [];
  let releasedCredits = 0;

  for (const job of activeJobs) {
    const transitioned = await tx.generationJob.updateMany({
      where: {
        id: job.id,
        status: { notIn: ['COMPLETED', 'FAILED', 'INCOMPLETE', 'CANCELLED'] }
      },
      data: {
        status: 'CANCELLED',
        errorCode: 'USER_DEACTIVATED',
        errorMessage: 'User account deactivated',
        workerLeaseId: null,
        leaseExpiresAt: null
      }
    });

    if (transitioned.count === 0) {
      continue;
    }

    cancelledJobIds.push(job.id);

    if (job.reservedCredits > 0) {
      const existingRelease = await tx.creditTransaction.findUnique({
        where: { idempotencyKey: `release:${job.id}` }
      });

      if (!existingRelease) {
        await tx.userCreditBalance.updateMany({
          where: {
            userId: job.userId,
            reservedTokens: { gte: job.reservedCredits }
          },
          data: {
            reservedTokens: { decrement: job.reservedCredits },
            availableTokens: { increment: job.reservedCredits }
          }
        });

        await tx.creditTransaction.create({
          data: {
            userId: job.userId,
            amount: job.reservedCredits,
            type: 'RELEASE',
            jobId: job.id,
            idempotencyKey: `release:${job.id}`
          }
        });

        releasedCredits += job.reservedCredits;
      }
    }

    await AuditLogRepository.create(
      {
        actorId: params.actorId,
        orgId: params.orgId,
        action: 'generation_job_cancelled_user_deactivated',
        target: job.id,
        details: {
          userId: params.userId,
          previousStatus: job.status,
          reservedCreditsReleased: job.reservedCredits,
          acceptedCount: job.acceptedCount,
          totalCostUsd: job.totalCostUsd
        },
        ipAddress: params.ipAddress,
        userAgent: params.userAgent
      },
      tx
    );
  }

  return { cancelledJobIds, releasedCredits };
}

export async function processGenerationJobStep(params: {
  jobId: string;
  geminiApiKey: string;
}): Promise<{ status: string; acceptedCount: number; requestedCount: number; hasMoreWork: boolean }> {
  const leaseId = crypto.randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + DEFAULT_LEASE_TTL_MS);

  const claimed = await prisma.generationJob.updateMany({
    where: {
      id: params.jobId,
      status: { in: ['PENDING', 'RUNNING'] },
      user: { disabledAt: null },
      AND: [
        { OR: [{ workerLeaseId: null }, { leaseExpiresAt: { lt: now } }] },
        { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] }
      ]
    },
    data: {
      status: 'RUNNING',
      workerLeaseId: leaseId,
      leaseExpiresAt
    }
  });

  const job = await prisma.generationJob.findUnique({
    where: { id: params.jobId },
    include: { user: { select: { disabledAt: true } } }
  });
  if (!job) {
    throw new JobDomainError('Generation job not found', 'JOB_NOT_FOUND', 404);
  }

  if (job.user?.disabledAt != null) {
    await releaseJobReservation(
      job.id,
      'CANCELLED',
      'USER_DEACTIVATED',
      'User account deactivated'
    );
    return {
      status: 'CANCELLED',
      acceptedCount: job.acceptedCount,
      requestedCount: job.requestedCount,
      hasMoreWork: false
    };
  }

  if (claimed.count === 0) {
    return {
      status: job.status,
      acceptedCount: job.acceptedCount,
      requestedCount: job.requestedCount,
      hasMoreWork: job.status === 'PENDING' || job.status === 'RUNNING'
    };
  }

  const startedAt = Date.now();
  let currentAccepted = job.acceptedCount;
  let currentRejected = job.rejectedCount;
  let currentRetry = job.retryCount;
  let stepCostUsd = 0;

  try {
    for (let stepIdx = 0; stepIdx < MAX_CANDIDATES_PER_STEP; stepIdx++) {
      if (currentAccepted >= job.requestedCount) break;
      if (currentRetry >= job.maxRetries) break;
      if (Date.now() - startedAt > WORKER_STEP_BUDGET_MS) break;

      const latestJob = await prisma.generationJob.findUnique({
        where: { id: job.id },
        select: {
          status: true,
          workerLeaseId: true,
          user: { select: { disabledAt: true } }
        }
      });
      if (!latestJob || latestJob.status === 'CANCELLED' || latestJob.workerLeaseId !== leaseId) {
        break;
      }
      if (latestJob.user?.disabledAt != null) {
        const transitioned = await releaseJobReservation(
          job.id,
          'CANCELLED',
          'USER_DEACTIVATED',
          'User account deactivated',
          undefined,
          {
            acceptedCount: currentAccepted,
            rejectedCount: currentRejected,
            retryCount: currentRetry,
            stepCostUsd
          },
          leaseId
        );
        if (!transitioned) {
          await persistDroppedStepCost(job.id, stepCostUsd);
          return resolveCurrentJobStepResult(job.id, 'CANCELLED', currentAccepted, job.requestedCount);
        }
        return {
          status: 'CANCELLED',
          acceptedCount: currentAccepted,
          requestedCount: job.requestedCount,
          hasMoreWork: false
        };
      }

      const attemptNumber = currentAccepted + currentRejected + 1;
      const vector =
        job.selectedVectors.length > 0
          ? job.selectedVectors[(attemptNumber - 1) % job.selectedVectors.length]
          : job.selectedTacticName;
      const attack =
        job.selectedAttacks.length > 0
          ? job.selectedAttacks[(attemptNumber - 1) % job.selectedAttacks.length]
          : vector;

      const remainingBudgetMs = Math.max(1_000, WORKER_STEP_BUDGET_MS - (Date.now() - startedAt));
      const generated = await runWithAbortTimeout(
        (abortSignal) =>
          generateOneGeminiCandidate({
            apiKey: params.geminiApiKey,
            framework: job.selectedFramework,
            frameworkVersion: job.frameworkVersion,
            tacticId: job.selectedTacticId,
            tacticName: job.selectedTacticName,
            attackVector: vector,
            attackName: attack,
            objectives: job.objectives || undefined,
            attemptNumber,
            abortSignal
          }),
        remainingBudgetMs,
        'Generator candidate step'
      );
      const generatorCostUsd = estimateAttemptCostUsd({
        generatorInputTokens: generated.inputTokens,
        generatorOutputTokens: generated.outputTokens
      });
      stepCostUsd += generatorCostUsd;

      const originalityBudgetMs = Math.max(1_000, WORKER_STEP_BUDGET_MS - (Date.now() - startedAt));
      const originality = await runWithAbortTimeout(
        (abortSignal) =>
          checkOriginalityAgainstRegistry({
            userId: job.userId,
            candidate: generated.payload,
            apiKey: params.geminiApiKey,
            abortSignal
          }),
        originalityBudgetMs,
        'Originality embedding step'
      );
      const embeddingCostUsd = estimateAttemptCostUsd({
        embeddingTokens: originality.embeddingTokens
      });
      stepCostUsd += embeddingCostUsd;

      if (!originality.passedDeterministic) {
        currentRejected++;
        currentRetry++;
        const attemptCost = generatorCostUsd + embeddingCostUsd;
        await prisma.candidateAttempt.create({
          data: {
            jobId: job.id,
            userId: job.userId,
            attemptNumber,
            status: 'REJECTED',
            rejectionStage: originality.rejectionStage,
            rejectionReason: originality.rejectionReason,
            selectedFramework: job.selectedFramework,
            selectedVector: vector,
            selectedAttack: attack,
            generatorModel: generated.modelUsed,
            generatorInputTokens: generated.inputTokens,
            generatorOutputTokens: generated.outputTokens,
            embeddingTokens: originality.embeddingTokens,
            estimatedCostUsd: attemptCost,
            sha256Fingerprint: originality.sha256Fingerprint,
            similaritySummary: { matches: originality.suspectMatches.length },
            candidatePayload: generated.payload as unknown as object
          }
        });
        continue;
      }

      const evalBudgetMs = Math.max(1_000, WORKER_STEP_BUDGET_MS - (Date.now() - startedAt));
      const evaluation = await runWithAbortTimeout(
        (abortSignal) =>
          evaluateCandidateIndependently({
            apiKey: params.geminiApiKey,
            candidate: generated.payload,
            requestedFramework: job.selectedFramework,
            frameworkVersion: job.frameworkVersion,
            requestedVector: vector,
            requestedAttack: attack,
            objectives: job.objectives || undefined,
            suspectMatches: originality.suspectMatches,
            abortSignal
          }),
        evalBudgetMs,
        'Independent evaluator step'
      );

      const evaluatorCostUsd = estimateAttemptCostUsd({
        evaluatorInputTokens: evaluation.inputTokens,
        evaluatorOutputTokens: evaluation.outputTokens
      });
      stepCostUsd += evaluatorCostUsd;
      const attemptCost = generatorCostUsd + embeddingCostUsd + evaluatorCostUsd;

      if (evaluation.decision !== 'ACCEPT') {
        currentRejected++;
        currentRetry++;
        await prisma.candidateAttempt.create({
          data: {
            jobId: job.id,
            userId: job.userId,
            attemptNumber,
            status: 'REJECTED',
            rejectionStage: 'EVALUATOR',
            rejectionReason: evaluation.rejectionReason,
            selectedFramework: job.selectedFramework,
            selectedVector: vector,
            selectedAttack: attack,
            generatorModel: generated.modelUsed,
            evaluatorModel: evaluation.modelUsed,
            generatorInputTokens: generated.inputTokens,
            generatorOutputTokens: generated.outputTokens,
            evaluatorInputTokens: evaluation.inputTokens,
            evaluatorOutputTokens: evaluation.outputTokens,
            embeddingTokens: originality.embeddingTokens,
            estimatedCostUsd: attemptCost,
            sha256Fingerprint: originality.sha256Fingerprint,
            similaritySummary: { matches: originality.suspectMatches.length },
            evaluatorDecision: evaluation.decision,
            evaluatorResult: evaluation as unknown as object,
            candidatePayload: generated.payload as unknown as object
          }
        });
        continue;
      }

      try {
        await acceptCandidateIntoRegistryWithLock({
          candidate: generated.payload,
          framework: job.selectedFramework,
          frameworkVersion: job.frameworkVersion,
          attackVector: vector,
          attackName: attack,
          originality,
          originalityMetadata: {
            evaluatorModel: evaluation.modelUsed,
            originalityScore: evaluation.originalityScore,
            alignmentScore: evaluation.alignmentScore
          },
          acceptanceStatus: 'ACCEPTED_UNDELIVERED',
          jobId: job.id,
          expectedLeaseId: leaseId
        });

        currentAccepted++;
        await prisma.candidateAttempt.create({
          data: {
            jobId: job.id,
            userId: job.userId,
            attemptNumber,
            status: 'ACCEPTED_INTERNAL',
            selectedFramework: job.selectedFramework,
            selectedVector: vector,
            selectedAttack: attack,
            generatorModel: generated.modelUsed,
            evaluatorModel: evaluation.modelUsed,
            generatorInputTokens: generated.inputTokens,
            generatorOutputTokens: generated.outputTokens,
            evaluatorInputTokens: evaluation.inputTokens,
            evaluatorOutputTokens: evaluation.outputTokens,
            embeddingTokens: originality.embeddingTokens,
            estimatedCostUsd: attemptCost,
            sha256Fingerprint: originality.sha256Fingerprint,
            similaritySummary: { matches: originality.suspectMatches.length },
            evaluatorDecision: 'ACCEPT',
            evaluatorResult: evaluation as unknown as object,
            candidatePayload: generated.payload as unknown as object
          }
        });
      } catch (lockErr) {
        currentRejected++;
        currentRetry++;
        await prisma.candidateAttempt.create({
          data: {
            jobId: job.id,
            userId: job.userId,
            attemptNumber,
            status: 'REJECTED',
            rejectionStage: 'CONCURRENCY_RECHECK',
            rejectionReason: lockErr instanceof Error ? lockErr.message : 'Concurrent duplicate detected',
            selectedFramework: job.selectedFramework,
            selectedVector: vector,
            selectedAttack: attack,
            generatorModel: generated.modelUsed,
            evaluatorModel: evaluation.modelUsed,
            generatorInputTokens: generated.inputTokens,
            generatorOutputTokens: generated.outputTokens,
            evaluatorInputTokens: evaluation.inputTokens,
            evaluatorOutputTokens: evaluation.outputTokens,
            embeddingTokens: originality.embeddingTokens,
            estimatedCostUsd: attemptCost,
            sha256Fingerprint: originality.sha256Fingerprint,
            candidatePayload: generated.payload as unknown as object
          }
        });
      }
    }

    if (currentAccepted < job.requestedCount && currentRetry >= job.maxRetries) {
      const transitioned = await releaseJobReservation(
        job.id,
        'INCOMPLETE',
        'MAX_RETRIES_EXCEEDED',
        'Reached retry limit before fulfilling full package; credits released.',
        undefined,
        {
          acceptedCount: currentAccepted,
          rejectedCount: currentRejected,
          retryCount: currentRetry,
          stepCostUsd
        },
        leaseId
      );
      if (!transitioned) {
        await persistDroppedStepCost(job.id, stepCostUsd);
        return resolveCurrentJobStepResult(job.id, 'CONFLICT', currentAccepted, job.requestedCount);
      }
      return {
        status: 'INCOMPLETE',
        acceptedCount: currentAccepted,
        requestedCount: job.requestedCount,
        hasMoreWork: false
      };
    }

    const stepAccepted = currentAccepted > job.acceptedCount;
    const backoffMs = Math.min(60_000, 1000 * Math.pow(2, Math.min(currentRetry, 6)));
    const leaseRelease = await prisma.generationJob.updateMany({
      where: { id: job.id, workerLeaseId: leaseId },
      data: {
        acceptedCount: currentAccepted,
        rejectedCount: currentRejected,
        retryCount: currentRetry,
        ...(stepCostUsd > 0 ? { totalCostUsd: { increment: stepCostUsd } } : {}),
        lastCheckpointAt: new Date(),
        nextRetryAt: stepAccepted ? new Date() : new Date(Date.now() + backoffMs),
        workerLeaseId: null,
        leaseExpiresAt: null
      }
    });

    if (leaseRelease.count === 0) {
      await persistDroppedStepCost(job.id, stepCostUsd);
      return resolveCurrentJobStepResult(job.id, 'CONFLICT', currentAccepted, job.requestedCount);
    }

    if (currentAccepted >= job.requestedCount) {
      await finalizeCompletePackage(job.id);
      return resolveCurrentJobStepResult(job.id, 'COMPLETED', currentAccepted, job.requestedCount);
    }

    return {
      status: 'RUNNING',
      acceptedCount: currentAccepted,
      requestedCount: job.requestedCount,
      hasMoreWork: true
    };
  } catch (err) {
    const nextRetryCount = currentRetry + 1;
    const backoffMs = Math.min(60_000, 1000 * Math.pow(2, Math.min(nextRetryCount, 6)));

    if (nextRetryCount >= job.maxRetries) {
      const transitioned = await releaseJobReservation(
        job.id,
        'FAILED',
        'PROVIDER_MAX_RETRIES_EXCEEDED',
        err instanceof Error ? err.message : 'Worker step failed after exhausting retries',
        undefined,
        {
          acceptedCount: currentAccepted,
          rejectedCount: currentRejected,
          retryCount: nextRetryCount,
          stepCostUsd
        },
        leaseId
      );
      if (!transitioned) {
        await persistDroppedStepCost(job.id, stepCostUsd);
        return resolveCurrentJobStepResult(job.id, 'FAILED', currentAccepted, job.requestedCount);
      }
      return {
        status: 'FAILED',
        acceptedCount: currentAccepted,
        requestedCount: job.requestedCount,
        hasMoreWork: false
      };
    }

    const errorUpdate = await prisma.generationJob.updateMany({
      where: { id: job.id, workerLeaseId: leaseId },
      data: {
        acceptedCount: currentAccepted,
        rejectedCount: currentRejected,
        retryCount: nextRetryCount,
        ...(stepCostUsd > 0 ? { totalCostUsd: { increment: stepCostUsd } } : {}),
        nextRetryAt: new Date(Date.now() + backoffMs),
        errorMessage: err instanceof Error ? err.message : 'Temporary worker step error',
        workerLeaseId: null,
        leaseExpiresAt: null
      }
    });

    if (errorUpdate.count === 0) {
      await persistDroppedStepCost(job.id, stepCostUsd);
      return resolveCurrentJobStepResult(job.id, 'CONFLICT', currentAccepted, job.requestedCount);
    }

    return {
      status: 'RUNNING',
      acceptedCount: currentAccepted,
      requestedCount: job.requestedCount,
      hasMoreWork: true
    };
  }
}

export async function cancelGenerationJob(
  jobId: string,
  userId: string,
  auditContext?: JobAuditContext
): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new JobDomainError('Generation job not found', 'JOB_NOT_FOUND', 404);
  }
  if (job.userId !== userId) {
    throw new JobDomainError('Forbidden', 'FORBIDDEN', 403);
  }
  if (job.status === 'COMPLETED') {
    throw new JobDomainError('Completed jobs cannot be cancelled', 'JOB_ALREADY_COMPLETED', 409);
  }
  await releaseJobReservation(job.id, 'CANCELLED', 'USER_CANCELLED', 'Cancelled by customer', auditContext);
}

export async function getSanitizedJobStatus(jobId: string, userId: string) {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: {
      vaultItems: {
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
      }
    }
  });

  if (!job) {
    throw new JobDomainError('Generation job not found', 'JOB_NOT_FOUND', 404);
  }
  if (job.userId !== userId) {
    throw new JobDomainError('Forbidden', 'FORBIDDEN', 403);
  }

  // Strictly enforce Atomic Package Fulfillment: never expose partial prompts before COMPLETED
  const deliveredPrompts =
    job.status === 'COMPLETED'
      ? job.vaultItems.map(v => ({
          vaultId: v.id,
          registryPromptId: v.registryPromptId,
          framework: v.registryPrompt.framework,
          frameworkVersion: v.registryPrompt.frameworkVersion,
          attackVector: v.registryPrompt.attackVector,
          attackName: v.registryPrompt.attackName,
          payload: v.registryPrompt.payload,
          acquiredAt: v.acquiredAt
        }))
      : [];

  return {
    id: job.id,
    status: job.status,
    requestedCount: job.requestedCount,
    acceptedCount: job.acceptedCount,
    rejectedCount: job.rejectedCount,
    remainingCount: Math.max(0, job.requestedCount - job.acceptedCount),
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    selectedFramework: job.selectedFramework,
    frameworkVersion: job.frameworkVersion,
    selectedTacticId: job.selectedTacticId,
    selectedTacticName: job.selectedTacticName,
    selectedVectors: job.selectedVectors,
    selectedAttacks: job.selectedAttacks,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    deliveredPrompts
  };
}

export async function recoverStalledJobs(
  geminiApiKey?: string,
  options?: { maxJobs?: number; budgetMs?: number }
): Promise<{
  recovered: number;
  resumedJobIds: string[];
  finalizedIncomplete: number;
}> {
  const now = new Date();
  const startedAt = Date.now();
  const maxJobs = options?.maxJobs ?? MAX_RECOVERY_JOBS_PER_RUN;
  const budgetMs = options?.budgetMs ?? RECOVERY_BUDGET_MS;

  const eligible = await prisma.generationJob.findMany({
    where: {
      status: { in: ['RUNNING', 'PENDING'] },
      user: { disabledAt: null },
      AND: [
        { OR: [{ leaseExpiresAt: { lt: now } }, { workerLeaseId: null }] },
        { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] }
      ]
    },
    include: { user: { select: { disabledAt: true } } },
    orderBy: { createdAt: 'asc' },
    take: maxJobs
  });

  let recovered = 0;
  let finalizedIncomplete = 0;
  const resumedJobIds: string[] = [];

  for (const job of eligible) {
    if (Date.now() - startedAt > budgetMs) {
      break;
    }

    if (job.user?.disabledAt != null) {
      await releaseJobReservation(
        job.id,
        'CANCELLED',
        'USER_DEACTIVATED',
        'User account deactivated'
      );
      continue;
    }

    if (job.retryCount >= job.maxRetries) {
      await releaseJobReservation(
        job.id,
        'INCOMPLETE',
        'STALLED_MAX_RETRIES',
        'Job exceeded retry limit after worker lease expiration'
      );
      finalizedIncomplete++;
      continue;
    }

    // Conditional lease-clear: only clear if observed workerLeaseId still owns an expired lease
    if (job.workerLeaseId !== null) {
      const cleared = await prisma.generationJob.updateMany({
        where: {
          id: job.id,
          workerLeaseId: job.workerLeaseId,
          leaseExpiresAt: { lt: now }
        },
        data: { workerLeaseId: null, leaseExpiresAt: null }
      });
      if (cleared.count === 0) {
        // Another worker claimed or renewed this job between discovery and recovery
        continue;
      }
    }

    recovered++;
    resumedJobIds.push(job.id);

    if (geminiApiKey && Date.now() - startedAt < budgetMs) {
      await processGenerationJobStep({ jobId: job.id, geminiApiKey }).catch(() => {});
    }
  }

  // Dedicated pass for deactivated users' jobs (even if nextRetryAt > now), without consuming active recovery maxJobs slots
  if (Date.now() - startedAt <= budgetMs) {
    const deactivatedJobs = await prisma.generationJob.findMany({
      where: {
        status: { in: ['RUNNING', 'PENDING'] },
        user: { disabledAt: { not: null } }
      },
      include: { user: { select: { disabledAt: true } } },
      orderBy: { createdAt: 'asc' },
      take: maxJobs
    });

    for (const job of deactivatedJobs ?? []) {
      if (Date.now() - startedAt > budgetMs) {
        break;
      }
      if (job.user?.disabledAt == null) {
        continue;
      }
      await releaseJobReservation(
        job.id,
        'CANCELLED',
        'USER_DEACTIVATED',
        'User account deactivated'
      );
    }
  }

  return { recovered, resumedJobIds, finalizedIncomplete };
}

export async function reportDeliveredDuplicate(params: {
  userId: string;
  vaultItemId: string;
  reason: string;
  geminiApiKey: string;
  auditContext?: JobAuditContext;
}) {
  const vaultItem = await prisma.customerPromptVault.findUnique({
    where: { id: params.vaultItemId },
    include: { registryPrompt: true, job: true }
  });

  if (!vaultItem) {
    throw new JobDomainError('Prompt vault item not found', 'VAULT_ITEM_NOT_FOUND', 404);
  }
  if (vaultItem.userId !== params.userId) {
    throw new JobDomainError('Forbidden', 'FORBIDDEN', 403);
  }
  if (vaultItem.isDuplicateReported || vaultItem.replacedByVaultId) {
    throw new JobDomainError('Duplicate already reported or replaced for this prompt', 'DUPLICATE_ALREADY_REPORTED', 409);
  }

  const candidatePayload = vaultItem.registryPrompt.payload as unknown as AttackPayload;

  // Check if another distinct registry record has an exact/normalized hash collision
  const exactOther = await prisma.globalPromptRegistry.findFirst({
    where: {
      id: { not: vaultItem.registryPromptId },
      OR: [
        { sha256Fingerprint: vaultItem.registryPrompt.sha256Fingerprint },
        { normalizedTextHash: vaultItem.registryPrompt.normalizedTextHash }
      ]
    },
    select: { id: true }
  });

  let confirmed = Boolean(exactOther);
  let otherMatchesCount = exactOther ? 1 : 0;
  let evaluatorConfirmed = false;

  if (!confirmed) {
    const originality = await checkOriginalityAgainstRegistry({
      userId: params.userId,
      candidate: candidatePayload,
      apiKey: params.geminiApiKey,
      excludeRegistryId: vaultItem.registryPromptId
    });

    const otherMatches = originality.suspectMatches.filter(m => m.registryId !== vaultItem.registryPromptId);
    otherMatchesCount = otherMatches.length;

    if (otherMatches.length > 0) {
      const evalRes = await evaluateCandidateIndependently({
        apiKey: params.geminiApiKey,
        candidate: candidatePayload,
        requestedFramework: vaultItem.registryPrompt.framework,
        frameworkVersion: vaultItem.registryPrompt.frameworkVersion,
        requestedVector: vaultItem.registryPrompt.attackVector,
        requestedAttack: vaultItem.registryPrompt.attackName,
        suspectMatches: otherMatches
      });
      evaluatorConfirmed = evalRes.isSubstantiveDuplicate;
      confirmed = evaluatorConfirmed;
    }
  }

  if (!confirmed) {
    const report = await prisma.$transaction(async (tx) => {
      if (tx.user?.findFirst) {
        const activeUser = await tx.user.findFirst({
          where: { id: params.userId, disabledAt: null },
          select: { id: true }
        });
        if (!activeUser) {
          throw new JobDomainError('Account has been deactivated', 'USER_DEACTIVATED', 403);
        }
      }

      const createdReport = await tx.duplicateReport.create({
        data: {
          userId: params.userId,
          vaultItemId: vaultItem.id,
          reason: params.reason,
          status: 'REJECTED',
          investigationResult: { matchCount: otherMatchesCount, evaluatorConfirmed },
          resolvedAt: new Date()
        }
      });

      if (params.auditContext) {
        await AuditLogRepository.create(
          {
            orgId: params.auditContext.orgId,
            actorId: params.userId,
            action: 'prompt_vault_duplicate_reported',
            target: vaultItem.id,
            details: {
              reasonLength: params.reason.length,
              confirmed: false,
              reportId: createdReport.id
            },
            ipAddress: params.auditContext.ipAddress,
            userAgent: params.auditContext.userAgent
          },
          tx
        );
      }

      return createdReport;
    });
    return { confirmed: false, reportId: report.id, replacementJobId: null };
  }

  // Atomic idempotent claim on vaultItem so concurrent duplicate reports cannot grant 2 replacements
  return prisma.$transaction(async (tx) => {
    if (tx.user?.findFirst) {
      const activeUser = await tx.user.findFirst({
        where: { id: params.userId, disabledAt: null },
        select: { id: true }
      });
      if (!activeUser) {
        throw new JobDomainError('Account has been deactivated', 'USER_DEACTIVATED', 403);
      }
    }

    const claimed = await tx.customerPromptVault.updateMany({
      where: {
        id: vaultItem.id,
        isDuplicateReported: false,
        replacedByVaultId: null
      },
      data: { isDuplicateReported: true }
    });

    if (claimed.count === 0) {
      throw new JobDomainError('Duplicate already reported or replaced for this prompt', 'DUPLICATE_ALREADY_REPORTED', 409);
    }

    const replacementJob = await tx.generationJob.create({
      data: {
        userId: params.userId,
        status: 'PENDING',
        requestedCount: 1,
        reservedCredits: 0,
        isReplacement: true,
        selectedFramework: vaultItem.registryPrompt.framework,
        frameworkVersion: vaultItem.registryPrompt.frameworkVersion,
        selectedTacticId: vaultItem.job.selectedTacticId,
        selectedTacticName: vaultItem.job.selectedTacticName,
        selectedVectors: [vaultItem.registryPrompt.attackVector],
        selectedAttacks: [vaultItem.registryPrompt.attackName],
        maxRetries: 15,
        idempotencyKey: `replacement:${vaultItem.id}`
      }
    });

    await tx.creditTransaction.create({
      data: {
        userId: params.userId,
        amount: 0,
        type: 'REPLACEMENT_GRANT',
        jobId: replacementJob.id,
        idempotencyKey: `replacement_grant:${vaultItem.id}`
      }
    });

    const report = await tx.duplicateReport.create({
      data: {
        userId: params.userId,
        vaultItemId: vaultItem.id,
        reason: params.reason,
        status: 'CONFIRMED',
        investigationResult: { matchCount: otherMatchesCount, evaluatorConfirmed },
        replacementJobId: replacementJob.id,
        resolvedAt: new Date()
      }
    });

    if (params.auditContext) {
      await AuditLogRepository.create(
        {
          orgId: params.auditContext.orgId,
          actorId: params.userId,
          action: 'prompt_vault_duplicate_reported',
          target: vaultItem.id,
          details: {
            reasonLength: params.reason.length,
            confirmed: true,
            reportId: report.id,
            replacementJobId: replacementJob.id
          },
          ipAddress: params.auditContext.ipAddress,
          userAgent: params.auditContext.userAgent
        },
        tx
      );
    }

    return { confirmed: true, reportId: report.id, replacementJobId: replacementJob.id };
  });
}
