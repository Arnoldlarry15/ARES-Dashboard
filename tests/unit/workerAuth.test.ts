import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { generateTokens, createCsrfToken } from '../../services/auth/jwt';

const {
  mockUsers,
  mockPrisma,
  mockProcessGenerationJobStep,
  mockCreateGenerationJob,
  mockGetSanitizedJobStatus,
  mockCancelGenerationJob,
  mockRecoverStalledJobs
} = vi.hoisted(() => {
  const mockUsers = new Map<string, { id: string; email: string; role: string; orgId: string }>();

  const mockPrisma: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return mockUsers.get(where.id) || null;
        if (where.email) {
          for (const u of mockUsers.values()) {
            if (u.email === where.email) return u;
          }
        }
        return null;
      })
    },
    userCreditBalance: {
      findUnique: vi.fn(async () => ({
        availableTokens: 10,
        reservedTokens: 2,
        updatedAt: new Date('2026-01-01T00:00:00Z')
      }))
    },
    generationJob: {
      findUnique: vi.fn(async () => ({ id: 'job_1', userId: 'analyst-1' })),
      findMany: vi.fn(async () => [
        {
          id: 'job_1',
          status: 'PENDING',
          requestedCount: 4,
          acceptedCount: 0,
          rejectedCount: 0,
          retryCount: 0,
          maxRetries: 3,
          selectedFramework: 'OWASP LLM Top 10',
          frameworkVersion: '2026',
          selectedTacticId: 'LLM01',
          selectedTacticName: 'Prompt Injection',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          completedAt: null
        }
      ])
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => ({ id: 'log_1', ...data }))
    }
  };

  return {
    mockUsers,
    mockPrisma,
    mockProcessGenerationJobStep: vi.fn(async ({ jobId }: { jobId: string }) => ({
      jobId,
      status: 'RUNNING',
      acceptedCount: 1,
      requestedCount: 4
    })),
    mockCreateGenerationJob: vi.fn(async (input: any) => ({
      id: 'job_new',
      status: 'PENDING',
      requestedCount: input.requestedCount,
      acceptedCount: 0,
      rejectedCount: 0,
      createdAt: new Date('2026-01-01T00:00:00Z')
    })),
    mockGetSanitizedJobStatus: vi.fn(async (jobId: string) => ({
      id: jobId,
      status: 'RUNNING',
      requestedCount: 4,
      acceptedCount: 1
    })),
    mockCancelGenerationJob: vi.fn(async () => undefined),
    mockRecoverStalledJobs: vi.fn(async () => ({ recovered: 0 }))
  };
});

vi.mock('../../utils/db', () => ({
  default: mockPrisma,
  prisma: mockPrisma
}));

vi.mock('../../lib/jobs/generationJobService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/jobs/generationJobService')>();
  return {
    ...actual,
    processGenerationJobStep: mockProcessGenerationJobStep,
    createGenerationJob: mockCreateGenerationJob,
    getSanitizedJobStatus: mockGetSanitizedJobStatus,
    cancelGenerationJob: mockCancelGenerationJob,
    recoverStalledJobs: mockRecoverStalledJobs
  };
});

import generationJobsHandler from '../../api/generation-jobs';

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

describe('Generation Jobs Worker Authorization', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockUsers.clear();
    mockUsers.set('viewer-1', { id: 'viewer-1', email: 'viewer@ares.app', role: 'viewer', orgId: 'org1' });
    mockUsers.set('analyst-1', { id: 'analyst-1', email: 'analyst@ares.app', role: 'analyst', orgId: 'org1' });
    mockUsers.set('rtl-1', { id: 'rtl-1', email: 'rtl@ares.app', role: 'red_team_lead', orgId: 'org1' });
    mockUsers.set('admin-1', { id: 'admin-1', email: 'admin@ares.app', role: 'admin', orgId: 'org1' });

    vi.clearAllMocks();

    process.env.JWT_SECRET = 'test-jwt-secret-must-be-32-chars-minimum';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-minimum';
    process.env.CSRF_SECRET = 'test-csrf-secret-32-chars-minimum';
    process.env.WORKER_SECRET = 'test-worker-secret-32-chars-min';
    process.env.CRON_SECRET = 'test-cron-secret-32-chars-minimum';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.ALLOWED_ORIGINS = ' https://app.ares.local , https://admin.ares.local ';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects action=worker with 401 when x-worker-secret is missing, before any DB lookup or job processing', async () => {
    const req: any = {
      method: 'POST',
      headers: {},
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const res = createMockRes();

    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
    expect(mockPrisma.generationJob.findUnique).not.toHaveBeenCalled();
  });

  it('rejects action=worker with 401 when x-worker-secret is invalid', async () => {
    const req: any = {
      method: 'POST',
      headers: { 'x-worker-secret': 'wrong-secret' },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const res = createMockRes();

    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
    expect(mockPrisma.generationJob.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    { userId: 'viewer-1', email: 'viewer@ares.app', role: 'viewer' },
    { userId: 'analyst-1', email: 'analyst@ares.app', role: 'analyst' },
    { userId: 'rtl-1', email: 'rtl@ares.app', role: 'red_team_lead' },
    { userId: 'admin-1', email: 'admin@ares.app', role: 'admin' }
  ])('rejects $role user session calling action=worker without x-worker-secret (401)', async (user) => {
    const { accessToken, jti } = generateTokens(user);
    const csrf = createCsrfToken(jti);

    // Bearer token attempt
    const reqBearer: any = {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resBearer = createMockRes();
    await generationJobsHandler(reqBearer, resBearer);

    expect(resBearer.status).toHaveBeenCalledWith(401);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
    expect(mockPrisma.generationJob.findUnique).not.toHaveBeenCalled();

    // Cookie + CSRF attempt
    const reqCookie: any = {
      method: 'POST',
      headers: {
        cookie: `access_token=${accessToken}; csrf_token=${csrf}`,
        'x-csrf-token': csrf
      },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resCookie = createMockRes();
    await generationJobsHandler(reqCookie, resCookie);

    expect(resCookie.status).toHaveBeenCalledWith(401);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
    expect(mockPrisma.generationJob.findUnique).not.toHaveBeenCalled();
  });

  it('authorizes action=worker with valid x-worker-secret (200) and calls processGenerationJobStep', async () => {
    const req: any = {
      method: 'POST',
      headers: { 'x-worker-secret': process.env.WORKER_SECRET },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const res = createMockRes();

    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockProcessGenerationJobStep).toHaveBeenCalledTimes(1);
    expect(mockProcessGenerationJobStep).toHaveBeenCalledWith({
      jobId: 'job_1',
      geminiApiKey: 'test-gemini-key'
    });
  });

  it('preserves customer endpoints for authenticated users and rejects x-worker-secret on customer endpoints', async () => {
    const { accessToken } = generateTokens({
      userId: 'analyst-1',
      email: 'analyst@ares.app',
      role: 'analyst',
      organizationId: 'org-test'
    });

    // 1. Rejects x-worker-secret on customer endpoints
    for (const reqCfg of [
      { method: 'GET', query: { action: 'credits' }, url: '/api/generation-jobs?action=credits' },
      { method: 'GET', query: {}, url: '/api/generation-jobs' },
      { method: 'GET', query: { id: 'job_1' }, url: '/api/generation-jobs?id=job_1' },
      {
        method: 'POST',
        query: {},
        body: {
          requestedCount: 4,
          selectedFramework: 'OWASP LLM Top 10',
          selectedTacticId: 'LLM01',
          selectedTacticName: 'Prompt Injection'
        },
        url: '/api/generation-jobs'
      },
      { method: 'DELETE', query: { id: 'job_1' }, url: '/api/generation-jobs?id=job_1' }
    ]) {
      const res = createMockRes();
      await generationJobsHandler(
        { ...reqCfg, headers: { 'x-worker-secret': process.env.WORKER_SECRET } } as any,
        res
      );
      expect(res.status).toHaveBeenCalledWith(401);
    }

    // 2. Allows authenticated user on GET ?action=credits (and trims ALLOWED_ORIGINS in CORS)
    const resCredits = createMockRes();
    await generationJobsHandler(
      {
        method: 'GET',
        headers: {
          authorization: `Bearer ${accessToken}`,
          origin: 'https://app.ares.local'
        },
        query: { action: 'credits' },
        url: '/api/generation-jobs?action=credits'
      } as any,
      resCredits
    );
    expect(resCredits.status).toHaveBeenCalledWith(200);
    expect(resCredits.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'https://app.ares.local');

    // 3. Allows authenticated user on GET list
    const resList = createMockRes();
    await generationJobsHandler(
      {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
        query: {},
        url: '/api/generation-jobs'
      } as any,
      resList
    );
    expect(resList.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.generationJob.findMany).toHaveBeenCalledTimes(1);

    // 4. Allows authenticated user on GET ?id=
    const resStatus = createMockRes();
    await generationJobsHandler(
      {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}` },
        query: { id: 'job_1' },
        url: '/api/generation-jobs?id=job_1'
      } as any,
      resStatus
    );
    expect(resStatus.status).toHaveBeenCalledWith(200);
    expect(mockGetSanitizedJobStatus).toHaveBeenCalledWith('job_1', 'analyst-1');

    // 5. Allows authenticated user on POST create
    const resCreate = createMockRes();
    await generationJobsHandler(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}` },
        query: {},
        body: {
          requestedCount: 4,
          selectedFramework: 'OWASP LLM Top 10',
          selectedTacticId: 'LLM01',
          selectedTacticName: 'Prompt Injection'
        },
        url: '/api/generation-jobs'
      } as any,
      resCreate
    );
    expect(resCreate.status).toHaveBeenCalledWith(201);
    expect(mockCreateGenerationJob).toHaveBeenCalledTimes(1);

    // 6. Allows authenticated user on DELETE ?id=
    const resDelete = createMockRes();
    await generationJobsHandler(
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${accessToken}` },
        query: { id: 'job_1' },
        url: '/api/generation-jobs?id=job_1'
      } as any,
      resDelete
    );
    expect(resDelete.status).toHaveBeenCalledWith(200);
    expect(mockCancelGenerationJob).toHaveBeenCalledWith(
      'job_1',
      'analyst-1',
      expect.objectContaining({ orgId: 'org-test' })
    );
  });

  it('returns 400 cleanly without TypeError for duplicate action or id query parameters', async () => {
    const reqDupAction: any = {
      method: 'POST',
      headers: { 'x-worker-secret': process.env.WORKER_SECRET },
      query: { action: ['worker', 'worker'], id: 'job_1' },
      url: '/api/generation-jobs?action=worker&action=worker&id=job_1'
    };
    const resDupAction = createMockRes();

    await generationJobsHandler(reqDupAction, resDupAction);

    expect(resDupAction.status).toHaveBeenCalledWith(400);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();

    const reqDupId: any = {
      method: 'POST',
      headers: { 'x-worker-secret': process.env.WORKER_SECRET },
      query: { action: 'worker', id: ['1', '2'] },
      url: '/api/generation-jobs?action=worker&id=1&id=2'
    };
    const resDupId = createMockRes();

    await generationJobsHandler(reqDupId, resDupId);

    expect(resDupId.status).toHaveBeenCalledWith(400);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
  });

  it('rejects duplicate x-worker-secret header (string[]) with 401', async () => {
    const req: any = {
      method: 'POST',
      headers: { 'x-worker-secret': [process.env.WORKER_SECRET, process.env.WORKER_SECRET] },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const res = createMockRes();

    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
  });

  it('rejects empty x-worker-secret and unset WORKER_SECRET with 401', async () => {
    const reqEmpty: any = {
      method: 'POST',
      headers: { 'x-worker-secret': '' },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resEmpty = createMockRes();

    await generationJobsHandler(reqEmpty, resEmpty);

    expect(resEmpty.status).toHaveBeenCalledWith(401);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();

    delete process.env.WORKER_SECRET;
    delete process.env.WORKER_SECRET_PREVIOUS;

    const reqUnset: any = {
      method: 'POST',
      headers: { 'x-worker-secret': 'some-secret-value' },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resUnset = createMockRes();

    await generationJobsHandler(reqUnset, resUnset);

    expect(resUnset.status).toHaveBeenCalledWith(401);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods (GET) on action=worker with 405', async () => {
    const req: any = {
      method: 'GET',
      headers: { 'x-worker-secret': process.env.WORKER_SECRET },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const res = createMockRes();

    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(mockProcessGenerationJobStep).not.toHaveBeenCalled();
  });

  it('authorizes action=worker via WORKER_SECRET_PREVIOUS during secret rotation (200)', async () => {
    process.env.WORKER_SECRET_PREVIOUS = '  previous-worker-secret-32-chars-min  ';

    const req: any = {
      method: 'POST',
      headers: { 'x-worker-secret': 'previous-worker-secret-32-chars-min' },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const res = createMockRes();

    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockProcessGenerationJobStep).toHaveBeenCalledTimes(1);
    expect(mockProcessGenerationJobStep).toHaveBeenCalledWith({
      jobId: 'job_1',
      geminiApiKey: 'test-gemini-key'
    });
  });

  it('enforces rate limiting on action=worker and returns 429 after exceeding limit', async () => {
    const workerIp = '198.51.100.77';

    for (let i = 0; i < 120; i++) {
      const req: any = {
        method: 'POST',
        headers: {
          'x-worker-secret': process.env.WORKER_SECRET,
          'x-forwarded-for': workerIp
        },
        socket: { remoteAddress: workerIp },
        query: { id: 'job_1', action: 'worker' },
        url: '/api/generation-jobs?id=job_1&action=worker'
      };
      const res = createMockRes();
      await generationJobsHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    }

    const reqLimited: any = {
      method: 'POST',
      headers: {
        'x-worker-secret': process.env.WORKER_SECRET,
        'x-forwarded-for': workerIp
      },
      socket: { remoteAddress: workerIp },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resLimited = createMockRes();
    await generationJobsHandler(reqLimited, resLimited);

    expect(resLimited.status).toHaveBeenCalledWith(429);
    expect(mockProcessGenerationJobStep).toHaveBeenCalledTimes(120);
  });

  it('rejects customer routes with 403 when organizationId is missing from token', async () => {
    const { accessToken } = generateTokens({
      userId: 'analyst-1',
      email: 'analyst@ares.app',
      role: 'analyst'
    });

    const req: any = {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
      socket: { remoteAddress: '198.51.100.55' },
      query: {},
      url: '/api/generation-jobs'
    };
    const res = createMockRes();
    await generationJobsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('prevents rotating X-Forwarded-For headers from bypassing workerRateLimit when TRUST_PROXY is not true', async () => {
    delete process.env.TRUST_PROXY;
    const socketIp = '198.51.100.88';

    for (let i = 0; i < 120; i++) {
      const req: any = {
        method: 'POST',
        headers: {
          'x-worker-secret': process.env.WORKER_SECRET,
          'x-forwarded-for': `203.0.113.${i}`
        },
        socket: { remoteAddress: socketIp },
        query: { id: 'job_1', action: 'worker' },
        url: '/api/generation-jobs?id=job_1&action=worker'
      };
      const res = createMockRes();
      await generationJobsHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    }

    const reqBypassAttempt: any = {
      method: 'POST',
      headers: {
        'x-worker-secret': process.env.WORKER_SECRET,
        'x-forwarded-for': '203.0.113.250'
      },
      socket: { remoteAddress: socketIp },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resBypassAttempt = createMockRes();
    await generationJobsHandler(reqBypassAttempt, resBypassAttempt);

    expect(resBypassAttempt.status).toHaveBeenCalledWith(429);
    expect(mockProcessGenerationJobStep).toHaveBeenCalledTimes(120);
  });

  it('separates workerRateLimit keys by X-Forwarded-For when TRUST_PROXY === "true"', async () => {
    process.env.TRUST_PROXY = 'true';
    const proxySocketIp = '10.0.0.1';

    for (let i = 0; i < 120; i++) {
      const req: any = {
        method: 'POST',
        headers: {
          'x-worker-secret': process.env.WORKER_SECRET,
          'x-forwarded-for': '203.0.114.10'
        },
        socket: { remoteAddress: proxySocketIp },
        query: { id: 'job_1', action: 'worker' },
        url: '/api/generation-jobs?id=job_1&action=worker'
      };
      const res = createMockRes();
      await generationJobsHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    }

    const reqSameIp: any = {
      method: 'POST',
      headers: {
        'x-worker-secret': process.env.WORKER_SECRET,
        'x-forwarded-for': '203.0.114.10'
      },
      socket: { remoteAddress: proxySocketIp },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resSameIp = createMockRes();
    await generationJobsHandler(reqSameIp, resSameIp);
    expect(resSameIp.status).toHaveBeenCalledWith(429);

    const reqDifferentIp: any = {
      method: 'POST',
      headers: {
        'x-worker-secret': process.env.WORKER_SECRET,
        'x-forwarded-for': '203.0.114.11'
      },
      socket: { remoteAddress: proxySocketIp },
      query: { id: 'job_1', action: 'worker' },
      url: '/api/generation-jobs?id=job_1&action=worker'
    };
    const resDifferentIp = createMockRes();
    await generationJobsHandler(reqDifferentIp, resDifferentIp);
    expect(resDifferentIp.status).toHaveBeenCalledWith(200);
  });

  it('preserves legitimate CRON_SECRET recovery (200) and enforces 30 req/min rate limit (429) on action=recover', async () => {
    const recoverIp = '198.51.100.201';

    for (let i = 0; i < 30; i++) {
      const req: any = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`
        },
        socket: { remoteAddress: recoverIp },
        query: { action: 'recover' },
        url: '/api/generation-jobs?action=recover'
      };
      const res = createMockRes();
      await generationJobsHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    }

    const reqLimited: any = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`
      },
      socket: { remoteAddress: recoverIp },
      query: { action: 'recover' },
      url: '/api/generation-jobs?action=recover'
    };
    const resLimited = createMockRes();
    await generationJobsHandler(reqLimited, resLimited);

    expect(resLimited.status).toHaveBeenCalledWith(429);
    expect(mockRecoverStalledJobs).toHaveBeenCalledTimes(30);
  });

  it('ignores spoofed X-Forwarded-For on action=recover rate limiting when TRUST_PROXY is disabled', async () => {
    delete process.env.TRUST_PROXY;
    const socketIp = '198.51.100.202';

    for (let i = 0; i < 30; i++) {
      const req: any = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
          'x-forwarded-for': `203.0.113.${i}`
        },
        socket: { remoteAddress: socketIp },
        query: { action: 'recover' },
        url: '/api/generation-jobs?action=recover'
      };
      const res = createMockRes();
      await generationJobsHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    }

    const reqSpoofed: any = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
        'x-forwarded-for': '203.0.113.250'
      },
      socket: { remoteAddress: socketIp },
      query: { action: 'recover' },
      url: '/api/generation-jobs?action=recover'
    };
    const resSpoofed = createMockRes();
    await generationJobsHandler(reqSpoofed, resSpoofed);

    expect(resSpoofed.status).toHaveBeenCalledWith(429);
    expect(mockRecoverStalledJobs).toHaveBeenCalledTimes(30);
  });
});
