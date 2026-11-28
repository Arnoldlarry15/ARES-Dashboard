// @vitest-environment node
import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import prisma from '../../utils/db';
import { UserRepository } from '../../repositories/userRepository';
import { generateTokens } from '../../services/auth/jwt';
import usersHandler from '../../api/users';

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

describe.skipIf(!isLocalDb)('Real PostgreSQL Last-Admin Concurrency & Advisory Lock Protection', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];

  async function createTestUser(orgId: string, label: string, role: string = 'admin') {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${runId}-${crypto.randomBytes(3).toString('hex')}@conc.test`,
        emailVerified: true,
        auth0Sub: `auth0|conc-${label}-${runId}-${crypto.randomBytes(3).toString('hex')}`,
        name: `Test ${label}`,
        role,
        orgId,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  beforeAll(() => {
    process.env.ALLOW_LOCAL_AUTH = 'true';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-must-be-32-chars-minimum';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars-minimum';
    process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret-32-chars-minimum';
  });

  afterAll(async () => {
    for (const uid of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id: uid } });
      } catch {
        // audit_logs is append-only in PostgreSQL and may reference actorId
      }
    }
    await prisma.$disconnect();
  });

  it('(1) two admins simultaneously attempt to deactivate each other -> one 200, one 409, >= 1 active admin remains', async () => {
    const orgId = `pg-conc-1-${runId}`;
    const admin1 = await createTestUser(orgId, 's1-a1', 'admin');
    const admin2 = await createTestUser(orgId, 's1-a2', 'admin');

    const r1 = createMockRes();
    const r2 = createMockRes();

    await Promise.all([
      usersHandler(
        {
          method: 'DELETE',
          headers: { authorization: bearerFor(admin1) },
          query: { id: admin2.id },
          url: '/api/users',
        } as any,
        r1.res
      ),
      usersHandler(
        {
          method: 'DELETE',
          headers: { authorization: bearerFor(admin2) },
          query: { id: admin1.id },
          url: '/api/users',
        } as any,
        r2.res
      ),
    ]);

    const statuses = [r1.res.statusCode, r2.res.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const activeAdmins = await prisma.user.count({
      where: { orgId, role: 'admin', disabledAt: null },
    });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });

  it('(2) two admins simultaneously attempt to demote each other -> one 200, one 409, >= 1 active admin remains', async () => {
    const orgId = `pg-conc-2-${runId}`;
    const admin1 = await createTestUser(orgId, 's2-a1', 'admin');
    const admin2 = await createTestUser(orgId, 's2-a2', 'admin');

    const r1 = createMockRes();
    const r2 = createMockRes();

    await Promise.all([
      usersHandler(
        {
          method: 'PUT',
          headers: { authorization: bearerFor(admin1) },
          body: { id: admin2.id, role: 'analyst' },
          url: '/api/users',
        } as any,
        r1.res
      ),
      usersHandler(
        {
          method: 'PUT',
          headers: { authorization: bearerFor(admin2) },
          body: { id: admin1.id, role: 'analyst' },
          url: '/api/users',
        } as any,
        r2.res
      ),
    ]);

    const statuses = [r1.res.statusCode, r2.res.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const activeAdmins = await prisma.user.count({
      where: { orgId, role: 'admin', disabledAt: null },
    });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });

  it('(3) one admin attempts DELETE while another attempts PUT demotion -> one 200, one 409, >= 1 active admin remains', async () => {
    const orgId = `pg-conc-3-${runId}`;
    const admin1 = await createTestUser(orgId, 's3-a1', 'admin');
    const admin2 = await createTestUser(orgId, 's3-a2', 'admin');

    const rDel = createMockRes();
    const rPut = createMockRes();

    await Promise.all([
      usersHandler(
        {
          method: 'DELETE',
          headers: { authorization: bearerFor(admin1) },
          query: { id: admin2.id },
          url: '/api/users',
        } as any,
        rDel.res
      ),
      usersHandler(
        {
          method: 'PUT',
          headers: { authorization: bearerFor(admin2) },
          body: { id: admin1.id, role: 'viewer' },
          url: '/api/users',
        } as any,
        rPut.res
      ),
    ]);

    const statuses = [rDel.res.statusCode, rPut.res.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const activeAdmins = await prisma.user.count({
      where: { orgId, role: 'admin', disabledAt: null },
    });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });

  it('(4) sole admin attempts self-demotion (PUT) -> 409', async () => {
    const orgId = `pg-conc-4-${runId}`;
    const soleAdmin = await createTestUser(orgId, 's4-sole', 'admin');

    const res = createMockRes();
    await usersHandler(
      {
        method: 'PUT',
        headers: { authorization: bearerFor(soleAdmin) },
        body: { id: soleAdmin.id, role: 'analyst' },
        url: '/api/users',
      } as any,
      res.res
    );

    expect(res.res.statusCode).toBe(409);
    expect(res.getBody()).toEqual({
      error: 'Conflict',
      message: 'Cannot demote the last active administrator in the organization',
    });

    const dbAdmin = await prisma.user.findUnique({ where: { id: soleAdmin.id } });
    expect(dbAdmin!.role).toBe('admin');
  });

  it('(5) sole admin attempts self-deactivation (DELETE) -> 400', async () => {
    const orgId = `pg-conc-5-${runId}`;
    const soleAdmin = await createTestUser(orgId, 's5-sole', 'admin');

    const res = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: bearerFor(soleAdmin) },
        query: { id: soleAdmin.id },
        url: '/api/users',
      } as any,
      res.res
    );

    expect(res.res.statusCode).toBe(400);
    const dbAdmin = await prisma.user.findUnique({ where: { id: soleAdmin.id } });
    expect(dbAdmin!.disabledAt).toBeNull();
  });

  it('(6) org with 2 admins successfully deactivates 1 -> 200, 1 active admin remains', async () => {
    const orgId = `pg-conc-6-${runId}`;
    const admin1 = await createTestUser(orgId, 's6-a1', 'admin');
    const admin2 = await createTestUser(orgId, 's6-a2', 'admin');

    const res = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: bearerFor(admin1) },
        query: { id: admin2.id },
        url: '/api/users',
      } as any,
      res.res
    );

    expect(res.res.statusCode).toBe(200);
    expect(res.getBody()).toEqual({ success: true, deactivated: true });

    const activeAdmins = await prisma.user.count({
      where: { orgId, role: 'admin', disabledAt: null },
    });
    expect(activeAdmins).toBe(1);
  });

  it('(7) failed transaction releases advisory lock -> subsequent admin operation succeeds cleanly', async () => {
    const orgId = `pg-conc-7-${runId}`;
    const admin1 = await createTestUser(orgId, 's7-a1', 'admin');
    const admin2 = await createTestUser(orgId, 's7-a2', 'admin');

    await expect(
      prisma.$transaction(async (tx) => {
        await UserRepository.acquireOrgAdminLock(orgId, tx);
        throw new Error('Simulated transaction failure');
      })
    ).rejects.toThrow('Simulated transaction failure');

    const res = createMockRes();
    await usersHandler(
      {
        method: 'PUT',
        headers: { authorization: bearerFor(admin1) },
        body: { id: admin2.id, role: 'red_team_lead' },
        url: '/api/users',
      } as any,
      res.res
    );

    expect(res.res.statusCode).toBe(200);
    expect(res.getBody().user.role).toBe('red_team_lead');
  });

  it('(8) concurrent PUT + DELETE cannot leave 0 active admins, PUT on deactivated user -> 404, POST returns 410 Gone without enumerating or creating auth0Sub: null users', async () => {
    const orgId = `pg-conc-8-${runId}`;
    const admin1 = await createTestUser(orgId, 's8-a1', 'admin');
    const admin2 = await createTestUser(orgId, 's8-a2', 'admin');
    const analyst = await createTestUser(orgId, 's8-u1', 'analyst');

    // Concurrent PUT demotion of admin1 + DELETE of admin2
    const rPutAdmin = createMockRes();
    const rDelAdmin = createMockRes();
    await Promise.all([
      usersHandler(
        {
          method: 'PUT',
          headers: { authorization: bearerFor(admin2) },
          body: { id: admin1.id, role: 'analyst' },
          url: '/api/users',
        } as any,
        rPutAdmin.res
      ),
      usersHandler(
        {
          method: 'DELETE',
          headers: { authorization: bearerFor(admin1) },
          query: { id: admin2.id },
          url: '/api/users',
        } as any,
        rDelAdmin.res
      ),
    ]);

    const activeAdmins = await prisma.user.count({
      where: { orgId, role: 'admin', disabledAt: null },
    });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);

    // Ensure we have an active admin token for the remaining checks
    const survivingAdmin = (await prisma.user.findFirst({
      where: { orgId, role: 'admin', disabledAt: null },
    }))!;
    const survivingAdminAuth = bearerFor(survivingAdmin);

    // Deactivate analyst, then PUT on deactivated user -> 404
    const rDelAnalyst = createMockRes();
    await usersHandler(
      {
        method: 'DELETE',
        headers: { authorization: survivingAdminAuth },
        query: { id: analyst.id },
        url: '/api/users',
      } as any,
      rDelAnalyst.res
    );
    expect(rDelAnalyst.res.statusCode).toBe(200);

    const rPutDeactivated = createMockRes();
    await usersHandler(
      {
        method: 'PUT',
        headers: { authorization: survivingAdminAuth },
        body: { id: analyst.id, name: 'Ghost', role: 'red_team_lead' },
        url: '/api/users',
      } as any,
      rPutDeactivated.res
    );
    expect(rPutDeactivated.res.statusCode).toBe(404);

    // POST with active email, deactivated email, or fresh email -> 410 Gone (non-enumerating, no auth0Sub: null row created)
    const expectedGoneBody = {
      error: 'Gone',
      code: 'DIRECT_USER_CREATION_DEPRECATED',
      message: 'Direct user creation is deprecated. Use POST /api/users?resource=invitations to invite users.',
    };

    const rPostDupActive = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: survivingAdminAuth },
        body: { email: survivingAdmin.email, role: 'analyst', orgId },
        url: '/api/users',
      } as any,
      rPostDupActive.res
    );
    expect(rPostDupActive.res.statusCode).toBe(410);
    expect(rPostDupActive.getBody()).toEqual(expectedGoneBody);

    const rPostDupDeactivated = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: survivingAdminAuth },
        body: { email: analyst.email, role: 'analyst', orgId },
        url: '/api/users',
      } as any,
      rPostDupDeactivated.res
    );
    expect(rPostDupDeactivated.res.statusCode).toBe(410);
    expect(rPostDupDeactivated.getBody()).toEqual(expectedGoneBody);

    const rPostFresh = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: survivingAdminAuth },
        body: { email: `fresh-${runId}@conc.test`, role: 'analyst', orgId },
        url: '/api/users',
      } as any,
      rPostFresh.res
    );
    expect(rPostFresh.res.statusCode).toBe(410);
    expect(rPostFresh.getBody()).toEqual(expectedGoneBody);

    const nullSubUsers = await prisma.user.count({
      where: { orgId, auth0Sub: null },
    });
    expect(nullSubUsers).toBe(0);
  });
});
