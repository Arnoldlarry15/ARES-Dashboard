import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import prisma from '../../utils/db';
import { AuditLogRepository } from '../../repositories/auditLogRepository';
import { getClientIp } from '../../lib/middleware/security';
import { generateTokens } from '../../services/auth/jwt';
import auditLogsHandler from '../../api/audit-logs';
import campaignsHandler from '../../api/campaigns';
import usersHandler from '../../api/users';
import generationJobsHandler from '../../api/generation-jobs';
import type { AuthenticatedRequest } from '../../lib/middleware/auth';

const isLocalDb =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.DATABASE_URL!.includes('localhost') || process.env.DATABASE_URL!.includes('127.0.0.1'));

function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: unknown;
  const res: Partial<VercelResponse> = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code: number) {
      statusCode = code;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value);
      return res as VercelResponse;
    },
    status(code: number) {
      statusCode = code;
      return res as VercelResponse;
    },
    json(body: unknown) {
      jsonBody = body;
      return res as VercelResponse;
    },
    end() {
      return res as VercelResponse;
    },
  };
  return {
    res: res as VercelResponse,
    headers,
    getStatus: () => statusCode,
    getBody: () => jsonBody as Record<string, unknown>,
  };
}

describe.skipIf(!isLocalDb)('Audit-Log Integrity (Real PostgreSQL)', () => {
  const testRunId = crypto.randomUUID().slice(0, 8);
  const orgA = `audit_org_a_${testRunId}`;
  const orgB = `audit_org_b_${testRunId}`;
  const userAId = `audit_user_a_${testRunId}`;
  const userBId = `audit_user_b_${testRunId}`;
  const secretSubA = `auth0|secret-sub-a-${testRunId}`;
  const secretSubB = `auth0|secret-sub-b-${testRunId}`;

  const originalEnv = { ...process.env };
  let pool: Pool;
  let logAId: string;
  let logBId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    process.env.ALLOW_LOCAL_AUTH = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || `test_jwt_secret_${testRunId}`;
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `test_refresh_secret_${testRunId}`;

    await prisma.user.createMany({
      data: [
        {
          id: userAId,
          email: `${userAId}@local.test`,
          name: 'Audit User A',
          role: 'admin',
          orgId: orgA,
          auth0Sub: secretSubA,
        },
        {
          id: userBId,
          email: `${userBId}@local.test`,
          name: 'Audit User B',
          role: 'analyst',
          orgId: orgB,
          auth0Sub: secretSubB,
        },
      ],
    });
  });

  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  afterAll(async () => {
    process.env = originalEnv;
    await pool.end();
  });

  it('1. verifies orgId column, composite index, and append-only trigger are active in PostgreSQL', async () => {
    const colResult = await pool.query(
      `SELECT is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'orgId'`
    );
    expect(colResult.rows).toHaveLength(1);
    expect(colResult.rows[0].is_nullable).toBe('NO');

    const idxResult = await pool.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'audit_logs' AND indexname = 'audit_logs_orgId_timestamp_idx'`
    );
    expect(idxResult.rows).toHaveLength(1);

    const trigResult = await pool.query(
      `SELECT tgname
       FROM pg_trigger
       WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal AND tgname IN ('audit_logs_immutable', 'audit_logs_no_truncate')`
    );
    expect(trigResult.rows.map((r: { tgname: string }) => r.tgname).sort()).toEqual([
      'audit_logs_immutable',
      'audit_logs_no_truncate',
    ]);
  });

  it('2. blocks UPDATE, DELETE, and TRUNCATE on audit_logs at the PostgreSQL trigger level', async () => {
    const created = await AuditLogRepository.create({
      orgId: orgA,
      actorId: userAId,
      action: `trigger_test_${testRunId}`,
      target: 'target_1',
      details: { test: true },
      ipAddress: '127.0.0.1',
    });
    logAId = created.id;

    await expect(
      pool.query(`UPDATE "audit_logs" SET "action" = 'tampered' WHERE "id" = $1`, [logAId])
    ).rejects.toThrow(/audit_logs is append-only/);

    await expect(
      pool.query(`DELETE FROM "audit_logs" WHERE "id" = $1`, [logAId])
    ).rejects.toThrow(/audit_logs is append-only/);

    await expect(
      pool.query(`TRUNCATE TABLE "audit_logs"`)
    ).rejects.toThrow(/audit_logs is append-only/);
  });

  it('3. enforces cross-org isolation across AuditLogRepository methods and omits sensitive actor fields', async () => {
    const logB = await AuditLogRepository.create({
      orgId: orgB,
      actorId: userBId,
      action: `shared_action_${testRunId}`,
      target: 'target_b',
      details: { org: 'B' },
      ipAddress: '10.0.0.2',
    });
    logBId = logB.id;

    const orgALogs = await AuditLogRepository.findMany({ orgId: orgA });
    expect(orgALogs.some(l => l.id === logAId)).toBe(true);
    expect(orgALogs.some(l => l.id === logBId)).toBe(false);

    const orgBCount = await AuditLogRepository.count({ orgId: orgB, action: `shared_action_${testRunId}` });
    expect(orgBCount).toBe(1);
    const orgACountForShared = await AuditLogRepository.count({ orgId: orgA, action: `shared_action_${testRunId}` });
    expect(orgACountForShared).toBe(0);

    expect(await AuditLogRepository.findById(logBId, orgA)).toBeNull();
    expect((await AuditLogRepository.findById(logBId, orgB))?.id).toBe(logBId);

    const crossActor = await AuditLogRepository.findByActorId(userBId, orgA);
    expect(crossActor).toHaveLength(0);
    const sameActor = await AuditLogRepository.findByActorId(userBId, orgB);
    expect(sameActor.some(l => l.id === logBId)).toBe(true);

    const crossAction = await AuditLogRepository.findByAction(`shared_action_${testRunId}`, orgA);
    expect(crossAction).toHaveLength(0);
    const sameAction = await AuditLogRepository.findByAction(`shared_action_${testRunId}`, orgB);
    expect(sameAction).toHaveLength(1);

    // Minimal actor projection: no auth0Sub leaked
    expect(sameAction[0].actor).toEqual({
      id: userBId,
      name: 'Audit User B',
      email: `${userBId}@local.test`,
      role: 'analyst',
    });
    expect('auth0Sub' in (sameAction[0].actor as Record<string, unknown>)).toBe(false);
  });

  it('4. blocks client-fabricated security events on POST /api/audit-logs and allows allowlisted telemetry', async () => {
    const { accessToken } = generateTokens({
      userId: userAId,
      email: `${userAId}@local.test`,
      role: 'admin',
      organizationId: orgA,
    });

    // Disallowed security event fabrication -> 403
    const blockedReq = {
      method: 'POST',
      url: '/api/audit-logs',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-real-ip': '198.51.100.77',
      },
      socket: { remoteAddress: '10.10.10.10' },
      body: {
        action: 'user_deleted',
        target: userBId,
        details: { forged: true },
      },
    } as unknown as AuthenticatedRequest;
    const blockedRes = createMockRes();
    await auditLogsHandler(blockedReq, blockedRes.res);
    expect(blockedRes.getStatus()).toBe(403);

    // Allowlisted telemetry event -> 201, with spoofed x-real-ip ignored when TRUST_PROXY !== 'true'
    const allowedReq = {
      method: 'POST',
      url: '/api/audit-logs',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-real-ip': '198.51.100.77',
        'user-agent': 'vitest-audit-agent',
      },
      socket: { remoteAddress: '10.10.10.10' },
      body: {
        action: 'ui_export',
        target: 'campaign_report',
        details: { format: 'csv' },
      },
    } as unknown as AuthenticatedRequest;
    const allowedRes = createMockRes();
    await auditLogsHandler(allowedReq, allowedRes.res);

    expect(allowedRes.getStatus()).toBe(201);
    const createdLog = allowedRes.getBody().auditLog as {
      orgId: string;
      actorId: string;
      action: string;
      ipAddress: string;
      actor: Record<string, unknown>;
    };
    expect(createdLog.orgId).toBe(orgA);
    expect(createdLog.actorId).toBe(userAId);
    expect(createdLog.action).toBe('ui_export');
    expect(createdLog.ipAddress).toBe('10.10.10.10');
    expect('auth0Sub' in createdLog.actor).toBe(false);
  });

  it('5. ignores spoofed proxy headers in getClientIp unless TRUST_PROXY === "true"', () => {
    const req = {
      headers: {
        'x-real-ip': '203.0.113.9',
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
      },
      socket: { remoteAddress: '192.0.2.5' },
    } as unknown as AuthenticatedRequest;

    delete process.env.TRUST_PROXY;
    expect(getClientIp(req)).toBe('192.0.2.5');

    process.env.TRUST_PROXY = 'false';
    expect(getClientIp(req)).toBe('192.0.2.5');

    process.env.TRUST_PROXY = 'true';
    // With TRUSTED_PROXY_HOPS=1 (default), rightmost XFF hop is trusted over leftmost spoofed IP
    expect(getClientIp(req)).toBe('10.0.0.1');

    // When x-forwarded-for is absent, x-real-ip is used
    const realIpOnlyReq = {
      headers: { 'x-real-ip': '203.0.113.9' },
      socket: { remoteAddress: '192.0.2.5' },
    } as unknown as AuthenticatedRequest;
    expect(getClientIp(realIpOnlyReq)).toBe('203.0.113.9');
  });

  it('6. rolls back Campaign, User, and GenerationJob mutations atomically when AuditLog insertion fails in PostgreSQL', async () => {
    const { accessToken } = generateTokens({
      userId: userAId,
      email: `${userAId}@local.test`,
      role: 'admin',
      organizationId: orgA,
    });

    // 1. Campaign POST rollback
    const campaignName = `rollback_campaign_${testRunId}`;
    const spyCampaign = vi
      .spyOn(AuditLogRepository, 'create')
      .mockRejectedValueOnce(new Error('Simulated audit log failure for campaign'));

    const campReq = {
      method: 'POST',
      url: '/api/campaigns',
      headers: { authorization: `Bearer ${accessToken}` },
      socket: { remoteAddress: '10.10.10.10' },
      body: {
        name: campaignName,
        framework: 'OWASP LLM Top 10',
        tacticId: 'LLM01',
        tacticName: 'Prompt Injection',
      },
    } as unknown as AuthenticatedRequest;
    const campRes = createMockRes();
    await campaignsHandler(campReq, campRes.res);
    spyCampaign.mockRestore();

    expect(campRes.getStatus()).toBe(500);
    const orphanedCampaigns = await prisma.campaign.findMany({ where: { name: campaignName } });
    expect(orphanedCampaigns).toHaveLength(0);

    // 2. OrganizationInvitation POST rollback (via /api/users?resource=invitations)
    const rollbackEmail = `rollback_invite_${testRunId}@local.test`;
    const spyUser = vi
      .spyOn(AuditLogRepository, 'create')
      .mockRejectedValueOnce(new Error('Simulated audit log failure for invitation'));

    const userReq = {
      method: 'POST',
      url: '/api/users?resource=invitations',
      query: { resource: 'invitations' },
      headers: { authorization: `Bearer ${accessToken}` },
      socket: { remoteAddress: '10.10.10.10' },
      body: {
        invitedEmail: rollbackEmail,
        role: 'analyst',
      },
    } as unknown as AuthenticatedRequest;
    const userRes = createMockRes();
    await usersHandler(userReq, userRes.res);
    spyUser.mockRestore();

    expect(userRes.getStatus()).toBe(500);
    const orphanedInvitation = await prisma.organizationInvitation.findFirst({
      where: { orgId: orgA, invitedEmail: rollbackEmail },
    });
    expect(orphanedInvitation).toBeNull();

    // 3. GenerationJob POST rollback (including credit reservation & CreditTransaction)
    await prisma.userCreditBalance.upsert({
      where: { userId: userAId },
      update: { availableTokens: 5, reservedTokens: 0 },
      create: { userId: userAId, availableTokens: 5, reservedTokens: 0 },
    });

    const spyJob = vi
      .spyOn(AuditLogRepository, 'create')
      .mockRejectedValueOnce(new Error('Simulated audit log failure for generation job'));

    const jobReq = {
      method: 'POST',
      url: '/api/generation-jobs',
      headers: { authorization: `Bearer ${accessToken}` },
      socket: { remoteAddress: '10.10.10.10' },
      body: {
        requestedCount: 4,
        selectedFramework: 'OWASP LLM Top 10',
        selectedTacticId: 'LLM01',
        selectedTacticName: 'Prompt Injection',
        idempotencyKey: `rollback_job_${testRunId}`,
      },
    } as unknown as AuthenticatedRequest;
    const jobRes = createMockRes();
    await generationJobsHandler(jobReq, jobRes.res);
    spyJob.mockRestore();

    expect(jobRes.getStatus()).toBe(500);
    const orphanedJobs = await prisma.generationJob.findMany({ where: { userId: userAId } });
    expect(orphanedJobs).toHaveLength(0);
    const orphanedCreditTxs = await prisma.creditTransaction.findMany({ where: { userId: userAId } });
    expect(orphanedCreditTxs).toHaveLength(0);
    const balanceAfter = await prisma.userCreditBalance.findUnique({ where: { userId: userAId } });
    expect(balanceAfter?.availableTokens).toBe(5);
    expect(balanceAfter?.reservedTokens).toBe(0);
  });
});
