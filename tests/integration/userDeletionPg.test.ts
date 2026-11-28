// @vitest-environment node
import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import prisma from '../../utils/db';
import { UserRepository } from '../../repositories/userRepository';
import { AuditLogRepository } from '../../repositories/auditLogRepository';
import { generateTokens } from '../../services/auth/jwt';
import usersHandler from '../../api/users';
import {
  JobDomainError,
  cancelActiveJobsForUserInTx,
  createGenerationJob,
  processGenerationJobStep,
  recoverStalledJobs,
  reportDeliveredDuplicate,
} from '../../lib/jobs/generationJobService';

const mockGenerateContent = vi.fn();
const mockEmbedContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
      embedContent: mockEmbedContent,
    };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
  },
}));

const isLocalDb =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.DATABASE_URL!.includes('localhost') || process.env.DATABASE_URL!.includes('127.0.0.1'));

function createMockRes() {
  let body: any;
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    setHeader: () => res as VercelResponse,
    status(code: number) {
      this.statusCode = code;
      return res as VercelResponse;
    },
    json(data: any) {
      body = data;
      return res as VercelResponse;
    },
    end() {
      return res as VercelResponse;
    },
  };
  return { res: res as VercelResponse, getBody: () => body };
}

function bearerFor(user: { id: string; email: string; role: string; orgId: string }) {
  const { accessToken } = generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.orgId,
  });
  return `Bearer ${accessToken}`;
}

describe.skipIf(!isLocalDb)('Real PostgreSQL User Soft-Delete & Immutable Audit Integrity', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const orgA = `pg-del-org-a-${runId}`;
  const orgB = `pg-del-org-b-${runId}`;

  let orgAAdmin1: any;
  let orgAAdmin2: any;
  let orgAUserWithAudit: any;
  let orgAUserWithoutAudit: any;
  let orgBUser: any;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    process.env.ALLOW_LOCAL_AUTH = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-must-be-32-chars-minimum';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars-minimum';
    process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret-32-chars-minimum';

    orgAAdmin1 = await prisma.user.create({
      data: {
        email: `admin1-${runId}@orga.test`,
        emailVerified: true,
        auth0Sub: `auth0|del-admin1-${runId}`,
        name: 'Org A Admin 1',
        role: 'admin',
        orgId: orgA,
      },
    });
    orgAAdmin2 = await prisma.user.create({
      data: {
        email: `admin2-${runId}@orga.test`,
        emailVerified: true,
        auth0Sub: `auth0|del-admin2-${runId}`,
        name: 'Org A Admin 2',
        role: 'admin',
        orgId: orgA,
      },
    });
    orgAUserWithAudit = await prisma.user.create({
      data: {
        email: `audited-${runId}@orga.test`,
        emailVerified: true,
        auth0Sub: `auth0|del-audited-${runId}`,
        name: 'Org A Audited User',
        role: 'analyst',
        orgId: orgA,
      },
    });
    orgAUserWithoutAudit = await prisma.user.create({
      data: {
        email: `unaudited-${runId}@orga.test`,
        emailVerified: true,
        auth0Sub: `auth0|del-unaudited-${runId}`,
        name: 'Org A Unaudited User',
        role: 'viewer',
        orgId: orgA,
      },
    });
    orgBUser = await prisma.user.create({
      data: {
        email: `user-${runId}@orgb.test`,
        emailVerified: true,
        auth0Sub: `auth0|del-orgb-${runId}`,
        name: 'Org B User',
        role: 'analyst',
        orgId: orgB,
      },
    });

    createdUserIds.push(
      orgAAdmin1.id,
      orgAAdmin2.id,
      orgAUserWithAudit.id,
      orgAUserWithoutAudit.id,
      orgBUser.id
    );

    // Seed immutable audit_logs history for orgAUserWithAudit
    await AuditLogRepository.create({
      orgId: orgA,
      actorId: orgAUserWithAudit.id,
      action: 'login',
      target: orgAUserWithAudit.id,
      details: { source: 'pg-test' },
    });
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      try {
        await prisma.duplicateReport.deleteMany({ where: { userId: uid } });
        await prisma.customerPromptVault.deleteMany({ where: { userId: uid } });
        await prisma.candidateAttempt.deleteMany({ where: { userId: uid } });
        await prisma.creditTransaction.deleteMany({ where: { userId: uid } });
        await prisma.generationJob.deleteMany({ where: { userId: uid } });
        await prisma.userCreditBalance.deleteMany({ where: { userId: uid } });
        await prisma.user.delete({ where: { id: uid } });
      } catch {
        // audit_logs is append-only in PostgreSQL and may reference actorId
      }
    }
    await prisma.globalPromptRegistry.deleteMany({ where: { attackName: { startsWith: `del-pg-${runId}` } } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('soft-deletes a user WITH immutable audit_logs history, preserves audit_logs, and blocks subsequent auth with 403', async () => {
    const adminAuth = bearerFor(orgAAdmin1);
    const targetAuth = bearerFor(orgAUserWithAudit);

    const resDel = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: adminAuth, 'user-agent': 'vitest-pg' },
        query: { id: orgAUserWithAudit.id },
        url: '/api/users',
      } as any,
      resDel.res
    );

    expect(resDel.res.statusCode).toBe(200);
    expect(resDel.getBody()).toEqual({ success: true, deactivated: true });

    const dbUser = await prisma.user.findUnique({ where: { id: orgAUserWithAudit.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.disabledAt).toBeInstanceOf(Date);

    // Immutable audit_logs history must remain intact
    const actorLogs = await prisma.auditLog.findMany({
      where: { actorId: orgAUserWithAudit.id, orgId: orgA },
    });
    expect(actorLogs.length).toBeGreaterThanOrEqual(1);
    expect(actorLogs.some((l) => l.action === 'login')).toBe(true);

    // Deactivation audit log should be recorded
    const deactivationLogs = await prisma.auditLog.findMany({
      where: { orgId: orgA, action: 'user_deactivated', target: orgAUserWithAudit.id },
    });
    expect(deactivationLogs.length).toBe(1);
    expect(deactivationLogs[0].actorId).toBe(orgAAdmin1.id);

    // Active-only repository queries must exclude deactivated user
    expect(await UserRepository.findByIdInOrg(orgAUserWithAudit.id, orgA)).toBeNull();
    expect(await UserRepository.findByEmailInOrg(orgAUserWithAudit.email, orgA)).toBeNull();

    // Subsequent auth with deactivated user's token must be rejected with 403
    const resAuth = createMockRes();
    await usersHandler(
      {
        method: 'GET',
        headers: { authorization: targetAuth },
        query: { id: orgAUserWithAudit.id },
        url: '/api/users',
      } as any,
      resAuth.res
    );
    expect(resAuth.res.statusCode).toBe(403);
    expect(resAuth.getBody().message).toBe('Account has been deactivated');
  });

  it('soft-deletes a user WITHOUT audit history and creates a user_deactivated audit log', async () => {
    const adminAuth = bearerFor(orgAAdmin1);

    const resDel = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: adminAuth },
        query: { id: orgAUserWithoutAudit.id },
        url: '/api/users',
      } as any,
      resDel.res
    );

    expect(resDel.res.statusCode).toBe(200);
    expect(resDel.getBody()).toEqual({ success: true, deactivated: true });

    const dbUser = await prisma.user.findUnique({ where: { id: orgAUserWithoutAudit.id } });
    expect(dbUser).not.toBeNull();
    expect(dbUser!.disabledAt).toBeInstanceOf(Date);

    const deactivationLogs = await prisma.auditLog.findMany({
      where: { orgId: orgA, action: 'user_deactivated', target: orgAUserWithoutAudit.id },
    });
    expect(deactivationLogs.length).toBe(1);
    expect((deactivationLogs[0].details as any)?.mode).toBe('soft_delete');
  });

  it('blocks self-deletion with 400 and keeps user active', async () => {
    const adminAuth = bearerFor(orgAAdmin1);

    const resSelf = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: adminAuth },
        query: { id: orgAAdmin1.id },
        url: '/api/users',
      } as any,
      resSelf.res
    );

    expect(resSelf.res.statusCode).toBe(400);
    const dbAdmin = await prisma.user.findUnique({ where: { id: orgAAdmin1.id } });
    expect(dbAdmin!.disabledAt).toBeNull();
  });

  it('returns 404 on cross-organization deletion and leaves target unaffected', async () => {
    const orgAAdminAuth = bearerFor(orgAAdmin1);

    const resCross = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: orgAAdminAuth },
        query: { id: orgBUser.id },
        url: '/api/users',
      } as any,
      resCross.res
    );

    expect(resCross.res.statusCode).toBe(404);
    const dbTarget = await prisma.user.findUnique({ where: { id: orgBUser.id } });
    expect(dbTarget!.disabledAt).toBeNull();
  });

  it('allows deleting a non-last admin (200) and blocks deleting the last active admin (409)', async () => {
    const admin1Auth = bearerFor(orgAAdmin1);

    // Non-last admin deletion succeeds (orgAAdmin1 remains active)
    const resNonLast = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: admin1Auth },
        query: { id: orgAAdmin2.id },
        url: '/api/users',
      } as any,
      resNonLast.res
    );
    expect(resNonLast.res.statusCode).toBe(200);
    expect(resNonLast.getBody()).toEqual({ success: true, deactivated: true });

    // Real PG countActiveAdminsInOrg confirms 0 remaining active admins when excluding orgAAdmin1
    const remainingForLastAdmin = await UserRepository.countActiveAdminsInOrg(orgA, orgAAdmin1.id);
    expect(remainingForLastAdmin).toBe(0);

    // Verify 409 Conflict when countActiveAdminsInOrg returns 0 for target admin
    const tempAdmin = await prisma.user.create({
      data: {
        email: `temp-admin-${runId}@orga.test`,
        emailVerified: true,
        name: 'Temp Admin',
        role: 'admin',
        orgId: orgA,
      },
    });
    createdUserIds.push(tempAdmin.id);

    const spy = vi.spyOn(UserRepository, 'countActiveAdminsInOrg').mockResolvedValueOnce(0);
    try {
      const resLast = createMockRes();
      await usersHandler(
        {
          method: 'DELETE',
          headers: { authorization: admin1Auth },
          query: { id: tempAdmin.id },
          url: '/api/users',
        } as any,
        resLast.res
      );
      expect(resLast.res.statusCode).toBe(409);
      const dbTempAdmin = await prisma.user.findUnique({ where: { id: tempAdmin.id } });
      expect(dbTempAdmin!.disabledAt).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('returns 404 on repeated deletion of an already deactivated user', async () => {
    const adminAuth = bearerFor(orgAAdmin1);

    const resRepeat = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: adminAuth },
        query: { id: orgAUserWithAudit.id },
        url: '/api/users',
      } as any,
      resRepeat.res
    );

    expect(resRepeat.res.statusCode).toBe(404);
  });

  describe('Generation Job Deactivation Safety', () => {
    async function createTestUserWithCredits(suffix: string, availableTokens = 10) {
      const user = await prisma.user.create({
        data: {
          email: `gen-${suffix}-${runId}@orga.test`,
          emailVerified: true,
          auth0Sub: `auth0|gen-${suffix}-${runId}`,
          name: `Gen User ${suffix}`,
          role: 'analyst',
          orgId: orgA,
        },
      });
      createdUserIds.push(user.id);
      await prisma.userCreditBalance.create({
        data: {
          userId: user.id,
          availableTokens,
          reservedTokens: 0,
        },
      });
      return user;
    }

    it('cancels pending job on deactivation before start, releases reservation once, and worker skips it', async () => {
      mockGenerateContent.mockClear();
      const user = await createTestUserWithCredits('pending-pre', 10);

      const job = await createGenerationJob({
        userId: user.id,
        requestedCount: 4, // reserves 1 credit
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: ['Direct Injection'],
        idempotencyKey: `pending-pre-${runId}`,
      });

      const balanceBefore = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceBefore!.availableTokens).toBe(9);
      expect(balanceBefore!.reservedTokens).toBe(1);

      const result = await prisma.$transaction(async (tx) => {
        await UserRepository.deleteInOrg(user.id, orgA, tx);
        return cancelActiveJobsForUserInTx(tx, {
          userId: user.id,
          orgId: orgA,
          actorId: orgAAdmin1.id,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest-pg',
        });
      });

      expect(result.cancelledJobIds).toEqual([job.id]);
      expect(result.releasedCredits).toBe(1);

      const dbJob = await prisma.generationJob.findUnique({ where: { id: job.id } });
      expect(dbJob!.status).toBe('CANCELLED');
      expect(dbJob!.errorCode).toBe('USER_DEACTIVATED');
      expect(dbJob!.errorMessage).toBe('User account deactivated');
      expect(dbJob!.workerLeaseId).toBeNull();
      expect(dbJob!.leaseExpiresAt).toBeNull();

      const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceAfter!.availableTokens).toBe(10);
      expect(balanceAfter!.reservedTokens).toBe(0);

      const releaseTxs = await prisma.creditTransaction.findMany({
        where: { jobId: job.id, type: 'RELEASE' },
      });
      expect(releaseTxs).toHaveLength(1);
      expect(releaseTxs[0].idempotencyKey).toBe(`release:${job.id}`);
      expect(releaseTxs[0].amount).toBe(1);

      const auditLogs = await prisma.auditLog.findMany({
        where: { orgId: orgA, action: 'generation_job_cancelled_user_deactivated', target: job.id },
      });
      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].actorId).toBe(orgAAdmin1.id);

      // Worker query (runTick filter) must exclude deactivated user's jobs
      const workerEligible = await prisma.generationJob.findMany({
        where: {
          id: job.id,
          status: { in: ['PENDING', 'RUNNING'] },
          user: { disabledAt: null },
        },
      });
      expect(workerEligible).toHaveLength(0);

      // Direct processGenerationJobStep must return CANCELLED with no generation
      const stepRes = await processGenerationJobStep({ jobId: job.id, geminiApiKey: 'test-key' });
      expect(stepRes.status).toBe('CANCELLED');
      expect(stepRes.hasMoreWork).toBe(false);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('stops at candidate loop checkpoint on deactivation during generation and preserves accrued cost', async () => {
      mockGenerateContent.mockClear();
      const user = await createTestUserWithCredits('mid-gen', 10);

      const job = await createGenerationJob({
        userId: user.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: ['Direct Injection'],
        idempotencyKey: `mid-gen-${runId}`,
      });

      // Simulate prior progress & accrued cost before deactivation
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'RUNNING',
          acceptedCount: 1,
          totalCostUsd: 0.0025,
        },
      });

      // Simulate user being deactivated right after worker claims the lease, before candidate loop iteration
      const origFindUnique = prisma.generationJob.findUnique.bind(prisma.generationJob);
      let callCount = 0;
      const spy = vi.spyOn(prisma.generationJob, 'findUnique').mockImplementation((async (args: any) => {
        callCount++;
        if (callCount === 2 && args?.where?.id === job.id) {
          await prisma.user.update({
            where: { id: user.id },
            data: { disabledAt: new Date() },
          });
        }
        return origFindUnique(args);
      }) as any);

      try {
        const stepRes = await processGenerationJobStep({ jobId: job.id, geminiApiKey: 'test-key' });
        expect(stepRes).toEqual({
          status: 'CANCELLED',
          acceptedCount: 1,
          requestedCount: 4,
          hasMoreWork: false,
        });
      } finally {
        spy.mockRestore();
      }

      expect(mockGenerateContent).not.toHaveBeenCalled();

      const dbJob = await prisma.generationJob.findUnique({ where: { id: job.id } });
      expect(dbJob!.status).toBe('CANCELLED');
      expect(dbJob!.errorCode).toBe('USER_DEACTIVATED');
      expect(dbJob!.acceptedCount).toBe(1);
      expect(dbJob!.totalCostUsd).toBeCloseTo(0.0025, 6);
      expect(dbJob!.workerLeaseId).toBeNull();
      expect(dbJob!.leaseExpiresAt).toBeNull();

      const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceAfter!.availableTokens).toBe(10);
      expect(balanceAfter!.reservedTokens).toBe(0);
    });

    it('cancels stalled jobs of deactivated users during recoverStalledJobs instead of resurrecting', async () => {
      mockGenerateContent.mockClear();
      const user = await createTestUserWithCredits('stalled', 10);

      const job = await createGenerationJob({
        userId: user.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: ['Direct Injection'],
        idempotencyKey: `stalled-${runId}`,
      });

      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'RUNNING',
          workerLeaseId: 'expired-lease-1',
          leaseExpiresAt: new Date(Date.now() - 120_000),
          retryCount: 1,
        },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { disabledAt: new Date() },
      });

      const recovery = await recoverStalledJobs('test-key');
      expect(recovery.resumedJobIds).not.toContain(job.id);
      expect(mockGenerateContent).not.toHaveBeenCalled();

      const dbJob = await prisma.generationJob.findUnique({ where: { id: job.id } });
      expect(dbJob!.status).toBe('CANCELLED');
      expect(dbJob!.errorCode).toBe('USER_DEACTIVATED');
      expect(dbJob!.workerLeaseId).toBeNull();
      expect(dbJob!.leaseExpiresAt).toBeNull();

      const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceAfter!.availableTokens).toBe(10);
      expect(balanceAfter!.reservedTokens).toBe(0);

      const releaseTxs = await prisma.creditTransaction.findMany({
        where: { jobId: job.id, type: 'RELEASE' },
      });
      expect(releaseTxs).toHaveLength(1);
    });

    it('handles concurrent deactivation and worker claim safely without double release or generation', async () => {
      mockGenerateContent.mockClear();
      const user = await createTestUserWithCredits('concurrent', 10);

      const job = await createGenerationJob({
        userId: user.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: ['Direct Injection'],
        idempotencyKey: `concurrent-${runId}`,
      });

      // Ensure deactivation and worker step racing results in CANCELLED, single RELEASE, and no generation
      const [txResult, stepResult] = await Promise.all([
        prisma.$transaction(async (tx) => {
          await UserRepository.deleteInOrg(user.id, orgA, tx);
          return cancelActiveJobsForUserInTx(tx, {
            userId: user.id,
            orgId: orgA,
            actorId: orgAAdmin1.id,
          });
        }),
        processGenerationJobStep({ jobId: job.id, geminiApiKey: 'test-key' }),
      ]);

      expect(['CANCELLED', 'CONFLICT']).toContain(stepResult.status);
      expect(stepResult.hasMoreWork).toBe(false);
      expect(txResult.cancelledJobIds.length + (stepResult.status === 'CANCELLED' ? 1 : 0)).toBeGreaterThanOrEqual(1);

      const dbJob = await prisma.generationJob.findUnique({ where: { id: job.id } });
      expect(dbJob!.status).toBe('CANCELLED');
      expect(dbJob!.errorCode).toBe('USER_DEACTIVATED');

      const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceAfter!.availableTokens).toBe(10);
      expect(balanceAfter!.reservedTokens).toBe(0);

      const releaseTxs = await prisma.creditTransaction.findMany({
        where: { jobId: job.id, type: 'RELEASE' },
      });
      expect(releaseTxs).toHaveLength(1);
    });

    it('enforces idempotency on repeated cancellation calls and releases credits exactly once', async () => {
      const user = await createTestUserWithCredits('idempotent', 10);

      const job = await createGenerationJob({
        userId: user.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: ['Direct Injection'],
        idempotencyKey: `idempotent-${runId}`,
      });

      const first = await prisma.$transaction((tx) =>
        cancelActiveJobsForUserInTx(tx, {
          userId: user.id,
          orgId: orgA,
          actorId: orgAAdmin1.id,
        })
      );
      expect(first.cancelledJobIds).toEqual([job.id]);
      expect(first.releasedCredits).toBe(1);

      const second = await prisma.$transaction((tx) =>
        cancelActiveJobsForUserInTx(tx, {
          userId: user.id,
          orgId: orgA,
          actorId: orgAAdmin1.id,
        })
      );
      expect(second.cancelledJobIds).toEqual([]);
      expect(second.releasedCredits).toBe(0);

      const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceAfter!.availableTokens).toBe(10);
      expect(balanceAfter!.reservedTokens).toBe(0);

      const releaseTxs = await prisma.creditTransaction.findMany({
        where: { jobId: job.id, type: 'RELEASE' },
      });
      expect(releaseTxs).toHaveLength(1);
    });

    it('blocks createGenerationJob for deactivated users and handles concurrent deactivation race safely', async () => {
      const user = await createTestUserWithCredits('create-race', 10);

      const [createRes] = await Promise.allSettled([
        createGenerationJob({
          userId: user.id,
          requestedCount: 4,
          selectedFramework: 'MITRE ATLAS',
          frameworkVersion: '4.5',
          selectedTacticId: 'AML.TA0001',
          selectedTacticName: 'Reconnaissance',
          selectedVectors: ['Prompt Injection'],
          selectedAttacks: ['Direct Injection'],
          idempotencyKey: `create-race-${runId}`,
        }),
        prisma.$transaction(async (tx) => {
          await UserRepository.deleteInOrg(user.id, orgA, tx);
          return cancelActiveJobsForUserInTx(tx, {
            userId: user.id,
            orgId: orgA,
            actorId: orgAAdmin1.id,
          });
        }),
      ]);

      if (createRes.status === 'rejected') {
        expect(createRes.reason).toBeInstanceOf(JobDomainError);
        expect((createRes.reason as JobDomainError).code).toBe('USER_DEACTIVATED');
        expect((createRes.reason as JobDomainError).statusCode).toBe(403);
      } else {
        // If createGenerationJob committed before deactivation, cancelActiveJobsForUserInTx or recovery cancels it
        await recoverStalledJobs();
        const dbJob = await prisma.generationJob.findUnique({ where: { id: createRes.value.id } });
        expect(dbJob!.status).toBe('CANCELLED');
      }

      // Direct call after deactivation must always fail with USER_DEACTIVATED (403)
      await expect(
        createGenerationJob({
          userId: user.id,
          requestedCount: 4,
          selectedFramework: 'MITRE ATLAS',
          frameworkVersion: '4.5',
          selectedTacticId: 'AML.TA0001',
          selectedTacticName: 'Reconnaissance',
          selectedVectors: ['Prompt Injection'],
          selectedAttacks: ['Direct Injection'],
          idempotencyKey: `create-after-${runId}`,
        })
      ).rejects.toMatchObject({ code: 'USER_DEACTIVATED', statusCode: 403 });

      const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceAfter!.availableTokens).toBe(10);
      expect(balanceAfter!.reservedTokens).toBe(0);
    });

    it('blocks reportDeliveredDuplicate for deactivated users and handles concurrent deactivation race safely', async () => {
      const user = await createTestUserWithCredits('dup-race', 10);
      const seedJob = await createGenerationJob({
        userId: user.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: [`del-pg-${runId}-dup`],
        idempotencyKey: `dup-seed-${runId}`,
      });
      await prisma.generationJob.update({
        where: { id: seedJob.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      const sharedHash = `dup-hash-${runId}`;
      const reg1 = await prisma.globalPromptRegistry.create({
        data: {
          framework: 'MITRE ATLAS',
          frameworkVersion: '4.5',
          attackVector: 'Prompt Injection',
          attackName: `del-pg-${runId}-dup`,
          payload: { description: 'd', payload: 'p', format: 'Prompt', attack_name: 'a', attack_objective: 'o' },
          sha256Fingerprint: `dup-sha1-${runId}`,
          normalizedTextHash: sharedHash,
          structuralSignature: 'sig1',
          embeddingModel: 'gemini-embedding-001',
          embeddingDimensions: 768,
          acceptanceStatus: 'ACCEPTED',
        },
      });
      // Distinct registry record with identical normalizedTextHash so exactOther confirms duplicate deterministically
      await prisma.globalPromptRegistry.create({
        data: {
          framework: 'MITRE ATLAS',
          frameworkVersion: '4.5',
          attackVector: 'Prompt Injection',
          attackName: `del-pg-${runId}-dup-2`,
          payload: { description: 'd2', payload: 'p2', format: 'Prompt', attack_name: 'a2', attack_objective: 'o2' },
          sha256Fingerprint: `dup-sha2-${runId}`,
          normalizedTextHash: sharedHash,
          structuralSignature: 'sig2',
          embeddingModel: 'gemini-embedding-001',
          embeddingDimensions: 768,
          acceptanceStatus: 'ACCEPTED',
        },
      });

      const vaultItem = await prisma.customerPromptVault.create({
        data: {
          userId: user.id,
          jobId: seedJob.id,
          registryPromptId: reg1.id,
        },
      });

      const [dupRes] = await Promise.allSettled([
        reportDeliveredDuplicate({
          userId: user.id,
          vaultItemId: vaultItem.id,
          reason: 'Duplicate prompt delivered',
          geminiApiKey: 'test-key',
        }),
        prisma.$transaction(async (tx) => {
          await UserRepository.deleteInOrg(user.id, orgA, tx);
          return cancelActiveJobsForUserInTx(tx, {
            userId: user.id,
            orgId: orgA,
            actorId: orgAAdmin1.id,
          });
        }),
      ]);

      if (dupRes.status === 'rejected') {
        expect(dupRes.reason).toBeInstanceOf(JobDomainError);
        expect((dupRes.reason as JobDomainError).code).toBe('USER_DEACTIVATED');
        expect((dupRes.reason as JobDomainError).statusCode).toBe(403);
      } else {
        await recoverStalledJobs();
        const repJob = await prisma.generationJob.findUnique({ where: { id: dupRes.value.replacementJobId! } });
        expect(repJob!.status).toBe('CANCELLED');
      }

      // Direct call after deactivation must always fail with USER_DEACTIVATED (403)
      const vaultItem2 = await prisma.customerPromptVault.create({
        data: {
          userId: user.id,
          jobId: seedJob.id,
          registryPromptId: (await prisma.globalPromptRegistry.findFirst({ where: { attackName: `del-pg-${runId}-dup-2` } }))!.id,
        },
      });
      await expect(
        reportDeliveredDuplicate({
          userId: user.id,
          vaultItemId: vaultItem2.id,
          reason: 'Duplicate after deactivation',
          geminiApiKey: 'test-key',
        })
      ).rejects.toMatchObject({ code: 'USER_DEACTIVATED', statusCode: 403 });
    });

    it('preserves stepCostUsd and returns CANCELLED (never RUNNING) on mid-step deactivation after billable work', async () => {
      mockGenerateContent.mockReset();
      mockEmbedContent.mockReset();
      const user = await createTestUserWithCredits('midstep', 10);
      const job = await createGenerationJob({
        userId: user.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: [`del-pg-${runId}-midstep`],
        idempotencyKey: `midstep-${runId}`,
      });

      // Generator call succeeds with billable tokens, then user is deactivated during embedding step before it throws
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
          description: 'Billable candidate',
          payload: `Unique midstep payload ${runId} ${crypto.randomUUID()}`,
          format: 'Prompt',
          attack_name: `del-pg-${runId}-midstep`,
          attack_objective: 'Test',
        }),
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
      });
      mockEmbedContent.mockImplementationOnce(async () => {
        await prisma.$transaction(async (tx) => {
          await UserRepository.deleteInOrg(user.id, orgA, tx);
          await cancelActiveJobsForUserInTx(tx, {
            userId: user.id,
            orgId: orgA,
            actorId: orgAAdmin1.id,
          });
        });
        throw new Error('Simulated embedding abort after deactivation');
      });

      const stepResult = await processGenerationJobStep({ jobId: job.id, geminiApiKey: 'test-key' });

      expect(stepResult.status).toBe('CANCELLED');
      expect(stepResult.hasMoreWork).toBe(false);

      const dbJob = await prisma.generationJob.findUnique({ where: { id: job.id } });
      expect(dbJob!.status).toBe('CANCELLED');
      expect(Number(dbJob!.totalCostUsd)).toBeGreaterThan(0);

      const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: user.id } });
      expect(balanceAfter!.availableTokens).toBe(10);
      expect(balanceAfter!.reservedTokens).toBe(0);

      const releaseTxs = await prisma.creditTransaction.findMany({
        where: { jobId: job.id, type: 'RELEASE' },
      });
      expect(releaseTxs).toHaveLength(1);
    });

    it('recovers deactivated users jobs with future nextRetryAt without starving active recovery maxJobs slots', async () => {
      const deactivatedUser = await createTestUserWithCredits('future-retry-deact', 10);
      const activeUser = await createTestUserWithCredits('future-retry-active', 10);

      const deactJob = await createGenerationJob({
        userId: deactivatedUser.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: ['Direct Injection'],
        idempotencyKey: `future-deact-${runId}`,
      });
      await prisma.generationJob.update({
        where: { id: deactJob.id },
        data: {
          status: 'RUNNING',
          nextRetryAt: new Date(Date.now() + 300_000),
          workerLeaseId: 'deact-lease',
          leaseExpiresAt: new Date(Date.now() + 300_000),
        },
      });
      await prisma.user.update({
        where: { id: deactivatedUser.id },
        data: { disabledAt: new Date() },
      });

      const activeJob = await createGenerationJob({
        userId: activeUser.id,
        requestedCount: 4,
        selectedFramework: 'MITRE ATLAS',
        frameworkVersion: '4.5',
        selectedTacticId: 'AML.TA0001',
        selectedTacticName: 'Reconnaissance',
        selectedVectors: ['Prompt Injection'],
        selectedAttacks: ['Direct Injection'],
        idempotencyKey: `future-active-${runId}`,
      });
      await prisma.generationJob.update({
        where: { id: activeJob.id },
        data: {
          status: 'RUNNING',
          workerLeaseId: 'expired-active-lease',
          leaseExpiresAt: new Date(Date.now() - 60_000),
          nextRetryAt: null,
        },
      });

      const rec1 = await recoverStalledJobs(undefined, { maxJobs: 1 });
      expect(rec1.resumedJobIds).toContain(activeJob.id);

      const dbDeactJob = await prisma.generationJob.findUnique({ where: { id: deactJob.id } });
      expect(dbDeactJob!.status).toBe('CANCELLED');
      expect(dbDeactJob!.errorCode).toBe('USER_DEACTIVATED');

      // Repeated recovery call is idempotent
      await recoverStalledJobs(undefined, { maxJobs: 1 });
      const releaseTxs = await prisma.creditTransaction.findMany({
        where: { jobId: deactJob.id, type: 'RELEASE' },
      });
      expect(releaseTxs).toHaveLength(1);
      const deactBal = await prisma.userCreditBalance.findUnique({ where: { userId: deactivatedUser.id } });
      expect(deactBal!.availableTokens).toBe(10);
      expect(deactBal!.reservedTokens).toBe(0);
    });
  });
});
