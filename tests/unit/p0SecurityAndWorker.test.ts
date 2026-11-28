import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { generateTokens, createCsrfToken } from '../../services/auth/jwt';

const { mockUsers, mockAuditLogs, mockJobs, mockBalances, mockTransactions, mockPrisma } = vi.hoisted(() => {
  const mockUsers = new Map<string, any>();
  const mockAuditLogs: any[] = [];
  const mockJobs = new Map<string, any>();
  const mockBalances = new Map<string, { availableTokens: number; reservedTokens: number }>();
  const mockTransactions: any[] = [];

  const mockPrisma: any = {
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return mockUsers.get(where.id) || null;
        if (where.email) {
          for (const u of mockUsers.values()) if (u.email === where.email) return u;
        }
        return null;
      }),
      findMany: vi.fn(async () => Array.from(mockUsers.values())),
      create: vi.fn(async ({ data }: any) => {
        const u = { id: `u_${mockUsers.size + 1}`, ...data };
        mockUsers.set(u.id, u);
        return u;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const u = mockUsers.get(where.id);
        Object.assign(u, data);
        return u;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const u = mockUsers.get(where.id);
        mockUsers.delete(where.id);
        return u;
      })
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        const log = { id: `log_${mockAuditLogs.length + 1}`, ...data };
        mockAuditLogs.push(log);
        return log;
      }),
      findMany: vi.fn(async () => mockAuditLogs),
      count: vi.fn(async () => mockAuditLogs.length)
    },
    userCreditBalance: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const bal = mockBalances.get(where.userId);
        if (!bal) return { count: 0 };
        if (where.reservedTokens?.gte !== undefined && bal.reservedTokens < where.reservedTokens.gte) return { count: 0 };
        if (data.availableTokens?.increment) bal.availableTokens += data.availableTokens.increment;
        if (data.reservedTokens?.decrement) bal.reservedTokens -= data.reservedTokens.decrement;
        return { count: 1 };
      })
    },
    creditTransaction: {
      findUnique: vi.fn(async ({ where }: any) => {
        return mockTransactions.find(t => t.idempotencyKey === where.idempotencyKey) || null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const tx = { id: `ctx_${mockTransactions.length + 1}`, ...data };
        mockTransactions.push(tx);
        return tx;
      })
    },
    generationJob: {
      findUnique: vi.fn(async ({ where }: any) => mockJobs.get(where.id) || null),
      findMany: vi.fn(async ({ where }: any) => {
        const now = new Date();
        return Array.from(mockJobs.values()).filter(j => {
          if (where?.status?.in && !where.status.in.includes(j.status)) return false;
          if (j.nextRetryAt && j.nextRetryAt > now) return false;
          return true;
        });
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const j = mockJobs.get(where.id);
        Object.assign(j, data);
        return j;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const j = mockJobs.get(where.id);
        if (!j) return { count: 0 };
        if (where.AND) {
          const now = new Date();
          if (j.workerLeaseId !== null && (!j.leaseExpiresAt || j.leaseExpiresAt >= now)) {
            return { count: 0 };
          }
          if (j.nextRetryAt && j.nextRetryAt > now) {
            return { count: 0 };
          }
        }
        if (where.workerLeaseId && j.workerLeaseId !== where.workerLeaseId) {
          return { count: 0 };
        }
        Object.assign(j, data);
        return { count: 1 };
      })
    }
  };

  return { mockUsers, mockAuditLogs, mockJobs, mockBalances, mockTransactions, mockPrisma };
});

vi.mock('../../utils/db', () => ({
  default: mockPrisma,
  prisma: mockPrisma
}));

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY'
  }
}));

import usersHandler from '../../api/users';
import auditLogsHandler from '../../api/audit-logs';
import generateTacticHandler from '../../api/generate-tactic';
import generationJobsHandler from '../../api/generation-jobs';
import { processGenerationJobStep, recoverStalledJobs } from '../../lib/jobs/generationJobService';

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

describe('P0 Security Remediation & Worker Durability', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockUsers.clear();
    mockUsers.set('analyst-1', { id: 'analyst-1', email: 'a@local.ares.app', role: 'analyst', orgId: 'org1' });
    mockUsers.set('admin-1', { id: 'admin-1', email: 'admin@local.ares.app', role: 'admin', orgId: 'org1' });
    mockUsers.set('analyst-99', { id: 'analyst-99', email: 'a99@ares.app', role: 'analyst', orgId: 'org1' });
    mockAuditLogs.length = 0;
    mockJobs.clear();
    mockBalances.clear();
    mockTransactions.length = 0;
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

  it('blocks unauthenticated requests on /api/users, /api/audit-logs, and /api/generate-tactic', async () => {
    const req1: any = { method: 'GET', headers: {}, query: { email: 'a@b.com' }, url: '/api/users' };
    const res1 = createMockRes();
    await usersHandler(req1, res1);
    expect(res1.status).toHaveBeenCalledWith(401);

    const req2: any = { method: 'GET', headers: {}, query: {}, url: '/api/audit-logs' };
    const res2 = createMockRes();
    await auditLogsHandler(req2, res2);
    expect(res2.status).toHaveBeenCalledWith(401);

    const req3: any = {
      method: 'POST',
      headers: {},
      body: { id: 'LLM01', name: 'Prompt Injection', framework: 'OWASP LLM Top 10' },
      url: '/api/generate-tactic'
    };
    const res3 = createMockRes();
    await generateTacticHandler(req3, res3);
    expect(res3.status).toHaveBeenCalledWith(401);
  });

  it('blocks non-admin user creation, role modification, and deletion on /api/users', async () => {
    const { accessToken } = generateTokens({ userId: 'analyst-1', email: 'a@local.ares.app', role: 'analyst' });

    for (const method of ['POST', 'PUT', 'DELETE']) {
      const req: any = {
        method,
        headers: { authorization: `Bearer ${accessToken}` },
        query: { id: 'target-1' },
        body: { id: 'target-1', email: 'x@y.com', role: 'admin', orgId: 'org1' },
        url: '/api/users'
      };
      const res = createMockRes();
      await usersHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it('enforces CSRF on cookie-authenticated /api/users and derives audit actorId from req.user.userId', async () => {
    const { accessToken, jti } = generateTokens({ userId: 'admin-1', email: 'admin@local.ares.app', role: 'admin' });
    const csrf = createCsrfToken(jti);

    // Missing CSRF header -> 403
    const reqNoCsrf: any = {
      method: 'POST',
      headers: { cookie: `access_token=${accessToken}; csrf_token=${csrf}` },
      body: { email: 'new@ares.app', role: 'analyst', orgId: 'org1' },
      url: '/api/users'
    };
    const resNoCsrf = createMockRes();
    await usersHandler(reqNoCsrf, resNoCsrf);
    expect(resNoCsrf.status).toHaveBeenCalledWith(403);

    // Audit log POST ignores spoofed actorId and records authenticated user
    const analyst = generateTokens({ userId: 'analyst-99', email: 'a99@ares.app', role: 'analyst', organizationId: 'org1' });
    const reqAudit: any = {
      method: 'POST',
      headers: { authorization: `Bearer ${analyst.accessToken}` },
      body: { actorId: 'spoofed-admin', action: 'ui_export', target: 'manifest-1' },
      url: '/api/audit-logs'
    };
    const resAudit = createMockRes();
    await auditLogsHandler(reqAudit, resAudit);
    expect(resAudit.status).toHaveBeenCalledWith(201);
    expect(mockAuditLogs[0].actorId).toBe('analyst-99');
  });

  it('enforces worker secret authentication and blocks worker secret on customer routes', async () => {
    mockJobs.set('job_1', {
      id: 'job_1',
      userId: 'user_1',
      status: 'PENDING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 15,
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

    // Wrong worker secret -> 401
    const reqBad: any = {
      method: 'POST',
      query: { id: 'job_1', action: 'worker' },
      headers: { 'x-worker-secret': 'wrong-secret' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resBad = createMockRes();
    await generationJobsHandler(reqBad, resBad);
    expect(resBad.status).toHaveBeenCalledWith(401);

    // Worker secret on customer-facing GET /api/generation-jobs -> 401 (no customer access)
    const reqCust: any = {
      method: 'GET',
      query: {},
      headers: { 'x-worker-secret': process.env.WORKER_SECRET },
      url: '/api/generation-jobs'
    };
    const resCust = createMockRes();
    await generationJobsHandler(reqCust, resCust);
    expect(resCust.status).toHaveBeenCalledWith(401);

    // Wrong CRON_SECRET on recover -> 401
    const reqRecoverBad: any = {
      method: 'POST',
      query: { action: 'recover' },
      headers: { authorization: 'Bearer wrong-cron' },
      url: '/api/generation-jobs?action=recover'
    };
    const resRecoverBad = createMockRes();
    await generationJobsHandler(reqRecoverBad, resRecoverBad);
    expect(resRecoverBad.status).toHaveBeenCalledWith(401);
  });

  it('respects nextRetryAt, blocks concurrent worker claims, preserves credits on temporary failure, and releases on terminal failure', async () => {
    mockBalances.set('user_1', { availableTokens: 0, reservedTokens: 1 });
    mockJobs.set('job_retry', {
      id: 'job_retry',
      userId: 'user_1',
      status: 'RUNNING',
      requestedCount: 4,
      acceptedCount: 0,
      rejectedCount: 0,
      retryCount: 0,
      maxRetries: 2,
      reservedCredits: 1,
      selectedFramework: 'OWASP LLM Top 10',
      frameworkVersion: '2026',
      selectedTacticId: 'LLM01:2026',
      selectedTacticName: 'Prompt Injection',
      selectedVectors: ['Direct Instruction Override'],
      selectedAttacks: ['Direct Instruction Override'],
      workerLeaseId: null,
      leaseExpiresAt: null,
      nextRetryAt: new Date(Date.now() + 30_000) // In the future!
    });

    // Future nextRetryAt -> cannot claim lease
    const skipped = await processGenerationJobStep({ jobId: 'job_retry', geminiApiKey: 'test-key' });
    expect(skipped.hasMoreWork).toBe(true);
    expect(mockGenerateContent).not.toHaveBeenCalled();

    // Now make job eligible and simulate temporary provider error (retry 1 < maxRetries 2)
    mockJobs.get('job_retry').nextRetryAt = null;
    mockGenerateContent.mockRejectedValueOnce(new Error('Temporary 503'));
    const tempFail = await processGenerationJobStep({ jobId: 'job_retry', geminiApiKey: 'test-key' });
    expect(tempFail.status).toBe('RUNNING');
    expect(mockBalances.get('user_1')).toEqual({ availableTokens: 0, reservedTokens: 1 }); // Reservation preserved!

    // Make eligible again and hit terminal retry limit (retry 2 >= maxRetries 2) -> releases reservation
    mockJobs.get('job_retry').nextRetryAt = null;
    mockGenerateContent.mockRejectedValueOnce(new Error('Persistent 503'));
    const terminal = await processGenerationJobStep({ jobId: 'job_retry', geminiApiKey: 'test-key' });
    expect(terminal.status).toBe('FAILED');
    expect(mockBalances.get('user_1')).toEqual({ availableTokens: 1, reservedTokens: 0 });
  });

  it('recovers expired leases and actively resumes eligible work', async () => {
    mockJobs.set('job_stalled_active', {
      id: 'job_stalled_active',
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
      workerLeaseId: 'dead-worker',
      leaseExpiresAt: new Date(Date.now() - 10_000),
      nextRetryAt: null
    });

    mockGenerateContent.mockRejectedValueOnce(new Error('Simulated step'));
    const recovery = await recoverStalledJobs('test-key');
    expect(recovery.recovered).toBe(1);
    expect(recovery.resumedJobIds).toContain('job_stalled_active');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});
