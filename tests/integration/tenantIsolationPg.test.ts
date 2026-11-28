// @vitest-environment node
import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import prisma from '../../utils/db';
import { UserRepository } from '../../repositories/userRepository';
import { CampaignRepository } from '../../repositories/campaignRepository';
import { generateTokens } from '../../services/auth/jwt';
import usersHandler from '../../api/users';
import campaignsHandler from '../../api/campaigns';

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

describe.skipIf(!isLocalDb)('Real PostgreSQL Tenant Isolation', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const orgA = `pg-org-a-${runId}`;
  const orgB = `pg-org-b-${runId}`;

  let orgAAdmin: any;
  let orgAAnalyst: any;
  let orgBAdmin: any;
  let orgBAnalyst: any;
  let campA1: any;
  let campA2: any;
  let campB1: any;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-must-be-32-chars-minimum';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars-minimum';
    process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret-32-chars-minimum';

    orgAAdmin = await prisma.user.create({
      data: {
        email: `admin-a-${runId}@orga.test`,
        emailVerified: true,
        auth0Sub: `auth0|pg-admin-a-${runId}`,
        name: 'Org A Admin',
        role: 'admin',
        orgId: orgA,
      },
    });
    orgAAnalyst = await prisma.user.create({
      data: {
        email: `analyst-a-${runId}@orga.test`,
        emailVerified: true,
        auth0Sub: `auth0|pg-analyst-a-${runId}`,
        name: 'Org A Analyst',
        role: 'analyst',
        orgId: orgA,
      },
    });
    orgBAdmin = await prisma.user.create({
      data: {
        email: `admin-b-${runId}@orgb.test`,
        emailVerified: true,
        auth0Sub: `auth0|pg-admin-b-${runId}`,
        name: 'Org B Admin',
        role: 'admin',
        orgId: orgB,
      },
    });
    orgBAnalyst = await prisma.user.create({
      data: {
        email: `analyst-b-${runId}@orgb.test`,
        emailVerified: true,
        auth0Sub: `auth0|pg-analyst-b-${runId}`,
        name: 'Org B Analyst',
        role: 'analyst',
        orgId: orgB,
      },
    });
    createdUserIds.push(orgAAdmin.id, orgAAnalyst.id, orgBAdmin.id, orgBAnalyst.id);

    campA1 = await CampaignRepository.create({
      name: `Alpha SharedTerm ${runId}`,
      description: 'Org A prompt injection campaign',
      framework: 'OWASP_LLM',
      tacticId: 'LLM01',
      tacticName: 'Prompt Injection',
      createdBy: orgAAnalyst.id,
    });
    campA2 = await CampaignRepository.create({
      name: `Alpha Second ${runId}`,
      description: 'Org A data leakage campaign',
      framework: 'OWASP_LLM',
      tacticId: 'LLM06',
      tacticName: 'Sensitive Info Disclosure',
      createdBy: orgAAdmin.id,
    });
    campB1 = await CampaignRepository.create({
      name: `Beta SharedTerm ${runId}`,
      description: 'Org B confidential campaign',
      framework: 'OWASP_LLM',
      tacticId: 'LLM01',
      tacticName: 'Prompt Injection',
      createdBy: orgBAnalyst.id,
    });
  });

  afterAll(async () => {
    const testOrgIds = [orgA, orgB, `pg-org-c-${runId}`];
    try {
      await prisma.organizationInvitation.deleteMany({ where: { orgId: { in: testOrgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: testOrgIds } } });
    } catch {
      // ignore cleanup errors
    }
    try {
      await prisma.campaign.deleteMany({ where: { createdBy: { in: createdUserIds } } });
    } catch {
      // ignore cleanup errors
    }
    for (const uid of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id: uid } });
      } catch {
        // audit_logs is append-only in PostgreSQL and may reference actorId
      }
    }
    await prisma.$disconnect();
  });

  it('isolates repository reads, counts, and searches between two independent orgs', async () => {
    expect(await UserRepository.countByOrgId(orgA)).toBe(2);
    expect(await UserRepository.countByOrgId(orgB)).toBe(2);

    const orgAUsers = await UserRepository.findByOrgId(orgA);
    expect(orgAUsers.map(u => u.id).sort()).toEqual([orgAAdmin.id, orgAAnalyst.id].sort());

    expect(await UserRepository.findByIdInOrg(orgBAnalyst.id, orgA)).toBeNull();
    expect(await UserRepository.findByEmailInOrg(orgBAnalyst.email, orgA)).toBeNull();

    expect(await CampaignRepository.findById(campB1.id, orgA)).toBeNull();
    const fetchedA1 = await CampaignRepository.findById(campA1.id, orgA);
    expect(fetchedA1).not.toBeNull();
    expect((fetchedA1!.creator as any).auth0Sub).toBeUndefined();

    expect(await CampaignRepository.countByUserId(orgBAnalyst.id, orgA)).toBe(0);
    expect(await CampaignRepository.countByUserId(orgBAnalyst.id, orgB)).toBe(1);

    const searchA = await CampaignRepository.search(`SharedTerm ${runId}`, orgA);
    expect(searchA.map(c => c.id)).toEqual([campA1.id]);

    const allA = await CampaignRepository.findAll({ orgId: orgA });
    expect(allA.map(c => c.id).sort()).toEqual([campA1.id, campA2.id].sort());
  });

  it('blocks cross-org updates and deletes atomically in PostgreSQL and normalizes API existence responses', async () => {
    // Repository-level cross-org update/delete must fail closed
    expect(await UserRepository.updateInOrg(orgBAnalyst.id, orgA, { role: 'admin' })).toBeNull();
    expect(await UserRepository.deleteInOrg(orgBAnalyst.id, orgA)).toBe(false);
    expect(await CampaignRepository.update(campB1.id, orgA, { name: 'Tampered' })).toBeNull();
    expect(await CampaignRepository.delete(campB1.id, orgA)).toBe(false);

    // Verify Org B records were untouched
    const intactUser = await UserRepository.findByIdInOrg(orgBAnalyst.id, orgB);
    expect(intactUser?.role).toBe('analyst');
    const intactCamp = await CampaignRepository.findById(campB1.id, orgB);
    expect(intactCamp?.name).toBe(`Beta SharedTerm ${runId}`);

    // API-level existence normalization on /api/users
    const authA = bearerFor(orgAAdmin);
    const rUserCross = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: authA }, query: { id: orgBAnalyst.id }, url: '/api/users' } as any,
      rUserCross.res
    );
    expect(rUserCross.res.statusCode).toBe(200);
    expect(rUserCross.getBody()).toEqual({ user: null });

    const rUserMissing = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: authA }, query: { id: 'missing-id' }, url: '/api/users' } as any,
      rUserMissing.res
    );
    expect(rUserMissing.res.statusCode).toBe(200);
    expect(rUserMissing.getBody()).toEqual(rUserCross.getBody());

    // API-level existence normalization on /api/campaigns
    const rCampCross = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: authA }, query: { id: campB1.id }, url: '/api/campaigns' } as any,
      rCampCross.res
    );
    expect(rCampCross.res.statusCode).toBe(404);

    const rCampMissing = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: authA }, query: { id: 'missing-camp-id' }, url: '/api/campaigns' } as any,
      rCampMissing.res
    );
    expect(rCampMissing.res.statusCode).toBe(404);
    expect(rCampCross.getBody()).toEqual(rCampMissing.getBody());

    // Same-org update & delete succeed via API
    const authB = bearerFor(orgBAdmin);
    const rCampPut = createMockRes();
    await campaignsHandler(
      {
        method: 'PUT',
        headers: { authorization: authB },
        query: {},
        body: { id: campB1.id, name: `Beta Updated ${runId}` },
        url: '/api/campaigns',
      } as any,
      rCampPut.res
    );
    expect(rCampPut.res.statusCode).toBe(200);
    expect(rCampPut.getBody().campaign.name).toBe(`Beta Updated ${runId}`);

    const rCampDel = createMockRes();
    await campaignsHandler(
      { method: 'DELETE', headers: { authorization: authB }, query: { id: campB1.id }, url: '/api/campaigns' } as any,
      rCampDel.res
    );
    expect(rCampDel.res.statusCode).toBe(200);
    expect(await CampaignRepository.findById(campB1.id, orgB)).toBeNull();
  });

  it('resolveAuth0User fails closed without explicit orgId against real PostgreSQL', async () => {
    for (const badOrg of [undefined, '', '   ', 'default_org']) {
      await expect(
        UserRepository.resolveAuth0User({
          sub: `auth0|pg-bad-${runId}-${String(badOrg)}`,
          email: `bad-${runId}-${Math.random()}@org.test`,
          emailVerified: true,
          name: 'Bad Org',
          orgId: badOrg,
        })
      ).rejects.toThrow();
    }

    const provisioned = await UserRepository.resolveAuth0User({
      sub: `auth0|pg-good-${runId}`,
      email: `good-${runId}@orgc.test`,
      emailVerified: true,
      name: 'Good Org User',
      orgId: `pg-org-c-${runId}`,
    });
    createdUserIds.push(provisioned.id);
    expect(provisioned.orgId).toBe(`pg-org-c-${runId}`);
  });
});
