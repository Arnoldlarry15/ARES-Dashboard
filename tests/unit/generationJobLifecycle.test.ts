import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockState, mockPrisma } = vi.hoisted(() => {
  const mockState = {
    balances: new Map<string, { availableTokens: number; reservedTokens: number }>(),
    jobs: new Map<string, any>(),
    transactions: [] as any[],
    candidates: [] as any[],
    vault: new Map<string, any>(),
    reports: [] as any[]
  };

  const mockPrisma: any = {
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    userCreditBalance: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const bal = mockState.balances.get(where.userId);
        if (!bal) return { count: 0 };
        if (where.availableTokens?.gte !== undefined && bal.availableTokens < where.availableTokens.gte) {
          return { count: 0 };
        }
        if (where.reservedTokens?.gte !== undefined && bal.reservedTokens < where.reservedTokens.gte) {
          return { count: 0 };
        }
        if (data.availableTokens?.decrement) bal.availableTokens -= data.availableTokens.decrement;
        if (data.availableTokens?.increment) bal.availableTokens += data.availableTokens.increment;
        if (data.reservedTokens?.increment) bal.reservedTokens += data.reservedTokens.increment;
        if (data.reservedTokens?.decrement) bal.reservedTokens -= data.reservedTokens.decrement;
        return { count: 1 };
      })
    },
    creditTransaction: {
      findUnique: vi.fn(async ({ where }: any) => {
        return mockState.transactions.find(t => t.idempotencyKey === where.idempotencyKey) || null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const rec = { id: `tx_${mockState.transactions.length + 1}`, ...data };
        mockState.transactions.push(rec);
        return rec;
      })
    },
    generationJob: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) {
          const job = mockState.jobs.get(where.id);
          if (!job) return null;
          const vaultItems = Array.from(mockState.vault.values()).filter(v => v.jobId === job.id);
          return { ...job, vaultItems };
        }
        if (where.userId_idempotencyKey) {
          for (const j of mockState.jobs.values()) {
            if (
              j.userId === where.userId_idempotencyKey.userId &&
              j.idempotencyKey === where.userId_idempotencyKey.idempotencyKey
            ) {
              return j;
            }
          }
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return Array.from(mockState.jobs.values()).filter(j => {
          if (where.status?.in && !where.status.in.includes(j.status)) return false;
          if (where.leaseExpiresAt?.lt && (!j.leaseExpiresAt || j.leaseExpiresAt >= where.leaseExpiresAt.lt)) return false;
          return true;
        });
      }),
      create: vi.fn(async ({ data }: any) => {
        const job = {
          id: `job_${mockState.jobs.size + 1}`,
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount: 0,
          workerLeaseId: null,
          leaseExpiresAt: null,
          createdAt: new Date(),
          completedAt: null,
          ...data
        };
        mockState.jobs.set(job.id, job);
        return job;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const job = mockState.jobs.get(where.id);
        Object.assign(job, data);
        return job;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const job = mockState.jobs.get(where.id);
        if (!job) return { count: 0 };
        Object.assign(job, data);
        return { count: 1 };
      })
    }
  };

  return { mockState, mockPrisma };
});

vi.mock('../../utils/db', () => ({
  default: mockPrisma,
  prisma: mockPrisma
}));

import {
  JobDomainError,
  cancelGenerationJob,
  createGenerationJob,
  getSanitizedJobStatus,
  recoverStalledJobs
} from '../../lib/jobs/generationJobService';

describe('Generation Job Lifecycle & Atomic Package Fulfillment', () => {
  beforeEach(() => {
    mockState.balances.clear();
    mockState.jobs.clear();
    mockState.transactions = [];
    mockState.candidates = [];
    mockState.vault.clear();
    mockState.reports = [];
    vi.clearAllMocks();
  });

  it('reserves exact package credits (4->1, 12->3, 28->7, 40->10) idempotently', async () => {
    mockState.balances.set('user_1', { availableTokens: 25, reservedTokens: 0 });

    const job40 = await createGenerationJob({
      userId: 'user_1',
      requestedCount: 40,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      idempotencyKey: 'idem-40'
    });

    expect(job40.reservedCredits).toBe(10);
    expect(mockState.balances.get('user_1')).toEqual({ availableTokens: 15, reservedTokens: 10 });

    // Duplicate idempotencyKey does NOT double-reserve
    const retrySameKey = await createGenerationJob({
      userId: 'user_1',
      requestedCount: 40,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      idempotencyKey: 'idem-40'
    });
    expect(retrySameKey.id).toBe(job40.id);
    expect(mockState.balances.get('user_1')).toEqual({ availableTokens: 15, reservedTokens: 10 });
  });

  it('withholds partial prompts while incomplete and releases full credits on cancellation', async () => {
    mockState.balances.set('user_1', { availableTokens: 10, reservedTokens: 0 });
    const job = await createGenerationJob({
      userId: 'user_1',
      requestedCount: 40,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      idempotencyKey: 'idem-cancel'
    });

    // Simulate 37 of 40 accepted internally, job still RUNNING
    const stored = mockState.jobs.get(job.id);
    stored.status = 'RUNNING';
    stored.acceptedCount = 37;
    stored.rejectedCount = 6;

    const status = await getSanitizedJobStatus(job.id, 'user_1');
    expect(status.acceptedCount).toBe(37);
    expect(status.remainingCount).toBe(3);
    expect(status.deliveredPrompts).toEqual([]); // Zero partial prompt leakage

    await cancelGenerationJob(job.id, 'user_1');
    expect(mockState.jobs.get(job.id).status).toBe('CANCELLED');
    expect(mockState.balances.get('user_1')).toEqual({ availableTokens: 10, reservedTokens: 0 });
  });

  it('enforces strict customer ownership on job status and cancellation', async () => {
    mockState.balances.set('user_a', { availableTokens: 5, reservedTokens: 0 });
    const job = await createGenerationJob({
      userId: 'user_a',
      requestedCount: 4,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      idempotencyKey: 'idem-iso'
    });

    await expect(getSanitizedJobStatus(job.id, 'user_b')).rejects.toThrow(JobDomainError);
    await expect(cancelGenerationJob(job.id, 'user_b')).rejects.toThrow(JobDomainError);
  });

  it('recovers stalled jobs with expired leases and releases credits when maxRetries exceeded', async () => {
    mockState.balances.set('user_1', { availableTokens: 0, reservedTokens: 10 });
    mockState.jobs.set('job_stalled', {
      id: 'job_stalled',
      userId: 'user_1',
      status: 'RUNNING',
      requestedCount: 40,
      acceptedCount: 37,
      rejectedCount: 15,
      retryCount: 80,
      maxRetries: 80,
      reservedCredits: 10,
      leaseExpiresAt: new Date(Date.now() - 60_000),
      workerLeaseId: 'crashed-worker'
    });

    const recovery = await recoverStalledJobs();
    expect(recovery.finalizedIncomplete).toBe(1);
    expect(mockState.jobs.get('job_stalled').status).toBe('INCOMPLETE');
    expect(mockState.balances.get('user_1')).toEqual({ availableTokens: 10, reservedTokens: 0 });
  });
});
