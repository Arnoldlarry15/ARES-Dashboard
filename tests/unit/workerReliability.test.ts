import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { generateTokens } from '../../services/auth/jwt';

const { mockJobs, mockBalances, mockTransactions, mockCandidates, mockRegistry, mockVault, mockPrisma } = vi.hoisted(() => {
  const mockJobs = new Map<string, any>();
  const mockBalances = new Map<string, { availableTokens: number; reservedTokens: number }>();
  const mockTransactions: any[] = [];
  const mockCandidates: any[] = [];
  const mockRegistry = new Map<string, any>();
  const mockVault = new Map<string, any>();

  let onFindManyHook: (() => void) | null = null;

  const mockPrisma: any = {
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ installed: false }]),
    userCreditBalance: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const bal = mockBalances.get(where.userId);
        if (!bal) return { count: 0 };
        if (where.availableTokens?.gte !== undefined && bal.availableTokens < where.availableTokens.gte) return { count: 0 };
        if (where.reservedTokens?.gte !== undefined && bal.reservedTokens < where.reservedTokens.gte) return { count: 0 };
        if (data.availableTokens?.decrement) bal.availableTokens -= data.availableTokens.decrement;
        if (data.availableTokens?.increment) bal.availableTokens += data.availableTokens.increment;
        if (data.reservedTokens?.increment) bal.reservedTokens += data.reservedTokens.increment;
        if (data.reservedTokens?.decrement) bal.reservedTokens -= data.reservedTokens.decrement;
        return { count: 1 };
      })
    },
    creditTransaction: {
      findUnique: vi.fn(async ({ where }: any) => {
        return mockTransactions.find(t => t.idempotencyKey === where.idempotencyKey) || null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const tx = { id: `tx_${mockTransactions.length + 1}`, ...data };
        mockTransactions.push(tx);
        return tx;
      })
    },
    candidateAttempt: {
      create: vi.fn(async ({ data }: any) => {
        const rec = { id: `cand_${mockCandidates.length + 1}`, ...data };
        mockCandidates.push(rec);
        return rec;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return mockCandidates.filter(c => c.jobId === where.jobId && c.status === where.status);
      }),
      updateMany: vi.fn(async () => ({ count: 1 }))
    },
    globalPromptRegistry: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => Array.from(mockRegistry.values())),
      create: vi.fn(async ({ data }: any) => {
        const rec = { id: `reg_${mockRegistry.size + 1}`, createdAt: new Date(), ...data };
        mockRegistry.set(rec.id, rec);
        return rec;
      }),
      update: vi.fn(async () => ({}))
    },
    customerPromptVault: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({}))
    },
    generationJob: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) {
          const j = mockJobs.get(where.id);
          return j ? { ...j, vaultItems: [] } : null;
        }
        if (where.userId_idempotencyKey) {
          for (const j of mockJobs.values()) {
            if (j.userId === where.userId_idempotencyKey.userId && j.idempotencyKey === where.userId_idempotencyKey.idempotencyKey) {
              return j;
            }
          }
        }
        return null;
      }),
      findMany: vi.fn(async ({ where, take }: any) => {
        const now = new Date();
        const rows = Array.from(mockJobs.values()).filter(j => {
          if (where?.status?.in && !where.status.in.includes(j.status)) return false;
          if (j.nextRetryAt && j.nextRetryAt > now) return false;
          return true;
        });
        if (onFindManyHook) {
          const hook = onFindManyHook;
          onFindManyHook = null;
          hook();
        }
        return typeof take === 'number' ? rows.slice(0, take) : rows;
      }),
      create: vi.fn(async ({ data }: any) => {
        const job = {
          id: `job_${mockJobs.size + 1}`,
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount: 0,
          workerLeaseId: null,
          leaseExpiresAt: null,
          nextRetryAt: null,
          createdAt: new Date(),
          completedAt: null,
          ...data
        };
        mockJobs.set(job.id, job);
        return job;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const j = mockJobs.get(where.id);
        Object.assign(j, data);
        return j;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const j = mockJobs.get(where.id);
        if (!j) return { count: 0 };
        const now = new Date();

        if (where.AND) {
          if (j.workerLeaseId !== null && (!j.leaseExpiresAt || j.leaseExpiresAt >= now)) {
            return { count: 0 };
          }
          if (j.nextRetryAt && j.nextRetryAt > now) {
            return { count: 0 };
          }
        }
        if (where.workerLeaseId !== undefined && j.workerLeaseId !== where.workerLeaseId) {
          return { count: 0 };
        }
        if (where.leaseExpiresAt?.lt && (!j.leaseExpiresAt || j.leaseExpiresAt >= where.leaseExpiresAt.lt)) {
          return { count: 0 };
        }

        Object.assign(j, data);
        return { count: 1 };
      })
    },
    setOnFindManyHook(fn: () => void) {
      onFindManyHook = fn;
    }
  };

  return { mockJobs, mockBalances, mockTransactions, mockCandidates, mockRegistry, mockVault, mockPrisma };
});

vi.mock('../../utils/db', () => ({
  default: mockPrisma,
  prisma: mockPrisma
}));

const mockGenerateContent = vi.fn();
const mockEmbedContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      embedContent: mockEmbedContent
    };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY'
  }
}));

import generationJobsHandler from '../../api/generation-jobs';
import {
  getSanitizedJobStatus,
  processGenerationJobStep,
  recoverStalledJobs
} from '../../lib/jobs/generationJobService';

function createMockRes() {
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  };
  return res as VercelResponse;
}

describe('Worker Execution Reliability (Mocked DB)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockJobs.clear();
    mockBalances.clear();
    mockTransactions.length = 0;
    mockCandidates.length = 0;
    mockRegistry.clear();
    mockVault.clear();
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-jwt-secret-must-be-32-chars-minimum';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-minimum';
    process.env.CSRF_SECRET = 'test-csrf-secret-32-chars-minimum';
    process.env.WORKER_SECRET = 'test-worker-secret-32-chars-min';
    process.env.CRON_SECRET = 'test-cron-secret-32-chars-minimum';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('POST /api/generation-jobs creates job and returns 201 promptly without waiting for Gemini', async () => {
    mockBalances.set('user_1', { availableTokens: 10, reservedTokens: 0 });
    const { accessToken } = generateTokens({ userId: 'user_1', email: 'u1@ares.app', role: 'analyst' });

    const req: any = {
      method: 'POST',
      query: {},
      headers: { authorization: `Bearer ${accessToken}` },
      body: {
        requestedCount: 40,
        selectedFramework: 'OWASP LLM Top 10',
        selectedTacticId: 'LLM01:2026',
        selectedTacticName: 'Prompt Injection',
        selectedVectors: ['Direct Instruction Override'],
        idempotencyKey: 'decoupled-1'
      },
      url: '/api/generation-jobs'
    };
    const res = createMockRes();
    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockBalances.get('user_1')).toEqual({ availableTokens: 0, reservedTokens: 10 });
  });

  it('limits each worker step to 1 candidate and blocks concurrent duplicate claims', async () => {
    mockBalances.set('user_1', { availableTokens: 0, reservedTokens: 1 });
    mockJobs.set('job_one', {
      id: 'job_one',
      userId: 'user_1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 10,
      reservedCredits: 1,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      workerLeaseId: null,
      leaseExpiresAt: null,
      nextRetryAt: null
    });

    // Generator returns 1 valid candidate, then Evaluator accepts
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          description: 'Test prompt',
          payload: 'Distinct adversarial test payload #1',
          format: 'Prompt',
          attack_name: 'Direct Instruction Override',
          attack_objective: 'Test hierarchy'
        }),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 }
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          decision: 'ACCEPT',
          technicalValidityScore: 0.9,
          alignmentScore: 0.9,
          originalityScore: 0.9,
          practicalValueScore: 0.9,
          isSubstantiveDuplicate: false,
          reasoning: 'Valid and original'
        }),
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 }
      });

    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [0.1, 0.2, 0.3] }]
    });

    const stepResult = await processGenerationJobStep({ jobId: 'job_one', geminiApiKey: 'test-key' });
    expect(stepResult.acceptedCount).toBe(1);
    expect(stepResult.hasMoreWork).toBe(true);
    // Exactly 1 candidate processed (1 generator + 1 evaluator = 2 generateContent calls)
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);

    // Partial prompts remain withheld until all 4 are accepted
    const sanitized = await getSanitizedJobStatus('job_one', 'user_1');
    expect(sanitized.deliveredPrompts).toEqual([]);

    // Concurrent worker claim while active lease is held is rejected cleanly
    mockJobs.get('job_one').workerLeaseId = 'active-worker-1';
    mockJobs.get('job_one').leaseExpiresAt = new Date(Date.now() + 30_000);
    const concurrentResult = await processGenerationJobStep({ jobId: 'job_one', geminiApiKey: 'test-key' });
    expect(concurrentResult.hasMoreWork).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // No extra call
  });

  it('does not clear an active worker lease when recovery races with a new lease acquisition', async () => {
    mockJobs.set('job_race', {
      id: 'job_race',
      userId: 'user_1',
      status: 'RUNNING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 5,
      reservedCredits: 1,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      workerLeaseId: 'stale-worker',
      leaseExpiresAt: new Date(Date.now() - 10_000),
      nextRetryAt: null
    });

    // Simulate another worker claiming a fresh lease right after findMany discovers the stale job
    mockPrisma.setOnFindManyHook(() => {
      const j = mockJobs.get('job_race');
      j.workerLeaseId = 'new-active-worker';
      j.leaseExpiresAt = new Date(Date.now() + 45_000);
    });

    const rec = await recoverStalledJobs('test-key');
    expect(rec.recovered).toBe(0);
    expect(mockJobs.get('job_race').workerLeaseId).toBe('new-active-worker');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('bounds recovery workload to maxJobs per invocation', async () => {
    for (let i = 1; i <= 5; i++) {
      mockJobs.set(`job_b_${i}`, {
        id: `job_b_${i}`,
        userId: 'user_1',
        status: 'PENDING',
        requestedCount: 4,
        acceptedCount: 0,
        rejectedCount: 0,
        retryCount: 0,
        maxRetries: 5,
        reservedCredits: 1,
        selectedFramework: 'OWASP LLM Top 10',
        frameworkVersion: '2026',
        selectedTacticId: 'LLM01:2026',
        selectedTacticName: 'Prompt Injection',
        selectedVectors: ['Direct Instruction Override'],
        selectedAttacks: ['Direct Instruction Override'],
        workerLeaseId: null,
        leaseExpiresAt: null,
        nextRetryAt: null
      });
    }

    const rec = await recoverStalledJobs(undefined, { maxJobs: 2 });
    expect(rec.recovered).toBe(2);
    expect(rec.resumedJobIds).toHaveLength(2);
  });

  it('rejects WORKER_SECRET and customer Bearer tokens on action=recover (CRON_SECRET only)', async () => {
    const { accessToken } = generateTokens({ userId: 'user_1', email: 'u1@ares.app', role: 'admin' });

    const reqCustomer: any = {
      method: 'POST',
      query: { action: 'recover' },
      headers: { authorization: `Bearer ${accessToken}` },
      url: '/api/generation-jobs?action=recover'
    };
    const resCustomer = createMockRes();
    await generationJobsHandler(reqCustomer, resCustomer);
    expect(resCustomer.status).toHaveBeenCalledWith(401);

    const reqWorker: any = {
      method: 'POST',
      query: { action: 'recover' },
      headers: { 'x-worker-secret': process.env.WORKER_SECRET },
      url: '/api/generation-jobs?action=recover'
    };
    const resWorker = createMockRes();
    await generationJobsHandler(reqWorker, resWorker);
    expect(resWorker.status).toHaveBeenCalledWith(401);

    const reqCron: any = {
      method: 'POST',
      query: { action: 'recover' },
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      url: '/api/generation-jobs?action=recover'
    };
    const resCron = createMockRes();
    await generationJobsHandler(reqCron, resCron);
    expect(resCron.status).toHaveBeenCalledWith(200);
  });

  it('passes AbortSignal to Gemini calls and rejects stale lease writes in acceptCandidateIntoRegistryWithLock', async () => {
    mockBalances.set('user_1', { availableTokens: 0, reservedTokens: 1 });
    mockJobs.set('job_stale_write', {
      id: 'job_stale_write',
      userId: 'user_1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 5,
      reservedCredits: 1,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      workerLeaseId: null,
      leaseExpiresAt: null,
      nextRetryAt: null
    });

    let seenSignal: AbortSignal | undefined;
    mockGenerateContent
      .mockImplementationOnce(async (args: any) => {
        seenSignal = args?.config?.abortSignal;
        return {
          text: JSON.stringify({
            description: 'Test',
            payload: 'Adversarial payload for stale lease test',
            format: 'Prompt',
            attack_name: 'Direct Instruction Override',
            attack_objective: 'Test'
          })
        };
      })
      .mockImplementationOnce(async () => {
        // Simulate another worker taking over the lease while Evaluator was running
        mockJobs.get('job_stale_write').workerLeaseId = 'newer-worker';
        return {
          text: JSON.stringify({
            decision: 'ACCEPT',
            technicalValidityScore: 0.9,
            alignmentScore: 0.9,
            originalityScore: 0.9,
            practicalValueScore: 0.9,
            isSubstantiveDuplicate: false,
            reasoning: 'Valid'
          })
        };
      });

    mockEmbedContent.mockResolvedValueOnce({ embeddings: [{ values: [0.1, 0.2, 0.3] }] });

    const result = await processGenerationJobStep({ jobId: 'job_stale_write', geminiApiKey: 'test-key' });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    // Stale worker could NOT insert into GlobalPromptRegistry
    expect(mockRegistry.size).toBe(0);
    expect(result.acceptedCount).toBe(0);
  });
});
