// @vitest-environment node
import 'dotenv/config';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import prisma from '../../utils/db';
import { UserRepository } from '../../repositories/userRepository';
import { generateOnboardingToken, generateTokens, createCsrfToken } from '../../services/auth/jwt';
import { requireAuth, type AuthenticatedRequest } from '../../lib/middleware/auth';
import onboardingHandler from '../../api/onboarding';
import invitationsHandler from '../../api/users';

const isLocalDb =
  Boolean(process.env.DATABASE_URL) &&
  (process.env.DATABASE_URL!.includes('localhost') || process.env.DATABASE_URL!.includes('127.0.0.1'));

function createMockRes() {
  const headers: Record<string, string | string[]> = {};
  let body: any;
  const res: Partial<VercelResponse> & { headers: Record<string, string | string[]>; statusCode: number } = {
    headers,
    statusCode: 200,
    setHeader(name: string, value: string | string[]) {
      headers[name] = value;
      return res as VercelResponse;
    },
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
  return { res: res as VercelResponse, getBody: () => body, getHeaders: () => headers };
}

describe.skipIf(!isLocalDb)('Real PostgreSQL Onboarding & Invitations', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-must-be-32-chars-minimum';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars-minimum';
    process.env.CSRF_SECRET = process.env.CSRF_SECRET || 'test-csrf-secret-32-chars-minimum';
  });

  afterAll(async () => {
    if (!isLocalDb) return;
    if (createdOrgIds.length > 0) {
      try {
        await prisma.organizationInvitation.deleteMany({ where: { orgId: { in: createdOrgIds } } });
        await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
      } catch {
        // ignore cleanup errors
      }
    }
    // Clean up any legacy-pg-* test users (including leftover rows from interrupted runs)
    try {
      const legacyTestUsers = await prisma.user.findMany({
        where: { email: { startsWith: 'legacy-pg-' } },
        select: { id: true, orgId: true },
      });
      for (const u of legacyTestUsers) {
        if (!createdUserIds.includes(u.id)) {
          createdUserIds.push(u.id);
        }
        if (u.orgId.startsWith('legacy_org_')) {
          try {
            await prisma.organizationInvitation.deleteMany({ where: { orgId: u.orgId } });
            await prisma.organization.deleteMany({ where: { id: u.orgId } });
          } catch {
            // ignore cleanup errors
          }
        }
      }
    } catch {
      // ignore cleanup errors
    }
    for (const uid of createdUserIds) {
      try {
        await prisma.user.delete({ where: { id: uid } });
      } catch {
        // users with append-only audit_logs cannot be deleted due to FK constraint
      }
    }
    await prisma.$disconnect();
  });

  it('Flow A: create organization atomically provisions Organization + admin User + AuditLog', async () => {
    const sub = `auth0|flow-a-${runId}`;
    const email = `flow-a-${runId}@example.test`;
    const onboardingCookie = generateOnboardingToken({
      sub,
      email,
      emailVerified: true,
      name: 'Flow A Admin',
    });

    const onboardingJti = crypto.createHash('sha256').update(onboardingCookie).digest('hex');
    const onboardingCsrf = createCsrfToken(onboardingJti);

    const { res, getBody, getHeaders } = createMockRes();
    await onboardingHandler(
      {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
          cookie: `onboarding_token=${onboardingCookie}; csrf_token=${onboardingCsrf}`,
          'x-csrf-token': onboardingCsrf,
        },
        body: { action: 'create_organization', organizationName: `Org Flow A ${runId}` },
      } as any,
      res
    );

    expect(res.statusCode).toBe(201);
    const body = getBody();
    expect(body.user.role).toBe('admin');
    expect(body.user.organizationId).toMatch(/^org_/);
    expect(body.organization.id).toBe(body.user.organizationId);

    createdOrgIds.push(body.organization.id);
    createdUserIds.push(body.user.id);

    const setCookie = getHeaders()['Set-Cookie'] as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('onboarding_token=;'))).toBe(true);

    const logs = await prisma.auditLog.findMany({
      where: { orgId: body.organization.id, actorId: body.user.id },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('organization_created');
    expect(actions).toContain('user_created');

    // Second org creation attempt by same user -> 409 Conflict
    const { res: res2 } = createMockRes();
    await onboardingHandler(
      {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
          cookie: `onboarding_token=${onboardingCookie}; csrf_token=${onboardingCsrf}`,
          'x-csrf-token': onboardingCsrf,
        },
        body: { action: 'create_organization', organizationName: 'Second Org' },
      } as any,
      res2
    );
    expect(res2.statusCode).toBe(409);
  });

  it('Flow B: admin creates invitation, invited user redeems once, concurrent second redemption fails', async () => {
    const adminSub = `auth0|flow-b-admin-${runId}`;
    const adminEmail = `flow-b-admin-${runId}@example.test`;
    const { organization, user: admin } = await UserRepository.createOrganizationWithAdmin({
      auth0Sub: adminSub,
      email: adminEmail,
      name: 'Flow B Admin',
      organizationName: `Org Flow B ${runId}`,
    });
    createdOrgIds.push(organization.id);
    createdUserIds.push(admin.id);

    const { accessToken, jti } = generateTokens({
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      organizationId: organization.id,
    });
    const csrfToken = createCsrfToken(jti);

    const { res: createInvRes, getBody: getInvBody } = createMockRes();
    await invitationsHandler(
      {
        method: 'POST',
        query: { resource: 'invitations' },
      url: '/api/users?resource=invitations',
        headers: {
          cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        body: { role: 'red_team_lead', expiresInHours: 24 },
      } as any,
      createInvRes
    );

    expect(createInvRes.statusCode).toBe(201);
    const { invitation, token } = getInvBody();
    expect(invitation.orgId).toBe(organization.id);
    expect(invitation.role).toBe('red_team_lead');
    expect(invitation.tokenHash).toBeUndefined();
    expect(typeof token).toBe('string');

    // Concurrent redemption by two distinct Auth0 users using the same single-use token
    const [attempt1, attempt2] = await Promise.allSettled([
      UserRepository.acceptInvitation({
        token,
        auth0Sub: `auth0|invitee-1-${runId}`,
        email: `invitee-1-${runId}@example.test`,
        name: 'Invitee One',
      }),
      UserRepository.acceptInvitation({
        token,
        auth0Sub: `auth0|invitee-2-${runId}`,
        email: `invitee-2-${runId}@example.test`,
        name: 'Invitee Two',
      }),
    ]);

    const fulfilled = [attempt1, attempt2].filter((r) => r.status === 'fulfilled');
    const rejected = [attempt1, attempt2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof UserRepository.acceptInvitation>>>).value;
    createdUserIds.push(winner.user.id);
    expect(winner.user.orgId).toBe(organization.id);
    expect(winner.user.role).toBe('red_team_lead');

    const loserReason = (rejected[0] as PromiseRejectedResult).reason as Error;
    expect(loserReason.message).toMatch(/INVALID_OR_EXPIRED_INVITATION/);

    const invLogs = await prisma.auditLog.findMany({
      where: { orgId: organization.id },
    });
    expect(invLogs.map((l) => l.action)).toContain('invitation_created');
    expect(invLogs.map((l) => l.action)).toContain('invitation_accepted');
  });

  it('Flow C: returning user preserves org and role', async () => {
    const sub = `auth0|flow-c-${runId}`;
    const email = `flow-c-${runId}@example.test`;
    const { organization, user: created } = await UserRepository.createOrganizationWithAdmin({
      auth0Sub: sub,
      email,
      name: 'Flow C Admin',
      organizationName: `Org Flow C ${runId}`,
    });
    createdOrgIds.push(organization.id);
    createdUserIds.push(created.id);

    const returning = await UserRepository.resolveAuth0User({
      sub,
      email,
      emailVerified: true,
      orgId: 'org_some_other_claim_ignored',
    });

    expect(returning.id).toBe(created.id);
    expect(returning.orgId).toBe(organization.id);
    expect(returning.role).toBe('admin');
  });

  it('rejects legacy default_org membership in resolveAuth0User and requireAuth', async () => {
    const legacySub = `auth0|legacy-pg-${runId}`;
    const legacyUser = await prisma.user.create({
      data: {
        auth0Sub: legacySub,
        email: `legacy-pg-${runId}@example.test`,
        emailVerified: true,
        name: 'Legacy User',
        role: 'analyst',
        orgId: 'default_org',
      },
    });
    createdUserIds.push(legacyUser.id);

    await expect(
      UserRepository.resolveAuth0User({
        sub: legacySub,
        email: legacyUser.email,
        emailVerified: true,
      })
    ).rejects.toThrow(/LEGACY_ORG_MIGRATION_REQUIRED/);

    const { accessToken } = generateTokens({
      userId: legacyUser.id,
      email: legacyUser.email,
      role: 'analyst',
      organizationId: 'default_org',
    });
    const { res } = createMockRes();
    let nextCalled = false;
    await requireAuth(
      { headers: { authorization: `Bearer ${accessToken}` } } as unknown as AuthenticatedRequest,
      res,
      () => {
        nextCalled = true;
      }
    );
    expect(res.statusCode).toBe(403);
    expect(nextCalled).toBe(false);
  });

  it('migrated legacy_org_<id> admin can create, list, and revoke invitations without P2003', async () => {
    const legacyAdminSub = `auth0|legacy-admin-${runId}`;
    const legacyAdminEmail = `legacy-admin-${runId}@example.test`;
    const createdLegacy = await prisma.user.create({
      data: {
        auth0Sub: legacyAdminSub,
        email: legacyAdminEmail,
        emailVerified: true,
        name: 'Legacy Admin',
        role: 'admin',
        orgId: 'default_org',
      },
    });
    createdUserIds.push(createdLegacy.id);

    const legacyOrgId = `legacy_org_${createdLegacy.id}`;
    createdOrgIds.push(legacyOrgId);

    // Apply the same backfill semantics as migration 20261127110000
    await prisma.user.update({
      where: { id: createdLegacy.id },
      data: { orgId: legacyOrgId },
    });
    await prisma.organization.upsert({
      where: { id: legacyOrgId },
      update: {},
      create: {
        id: legacyOrgId,
        name: `Legacy Organization (${createdLegacy.id})`,
        createdBy: legacyAdminSub,
      },
    });

    const { accessToken, jti } = generateTokens({
      userId: createdLegacy.id,
      email: legacyAdminEmail,
      role: 'admin',
      organizationId: legacyOrgId,
    });
    const csrfToken = createCsrfToken(jti);

    // Create invitation
    const { res: createRes, getBody: getCreateBody } = createMockRes();
    await invitationsHandler(
      {
        method: 'POST',
        query: { resource: 'invitations' },
        url: '/api/users?resource=invitations',
        headers: {
          cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        body: { role: 'analyst', invitedEmail: `NewHire-${runId}@Example.test`, expiresInHours: 24 },
      } as any,
      createRes
    );
    expect(createRes.statusCode).toBe(201);
    const createdInv = getCreateBody().invitation;
    expect(createdInv.orgId).toBe(legacyOrgId);
    expect(createdInv.invitedEmail).toBe(`newhire-${runId}@example.test`);

    // List invitations
    const { res: listRes, getBody: getListBody } = createMockRes();
    await invitationsHandler(
      {
        method: 'GET',
        query: { resource: 'invitations' },
        url: '/api/users?resource=invitations',
        headers: { cookie: `access_token=${accessToken}` },
      } as any,
      listRes
    );
    expect(listRes.statusCode).toBe(200);
    expect(getListBody().invitations.some((i: any) => i.id === createdInv.id)).toBe(true);

    // Revoke invitation
    const { res: delRes } = createMockRes();
    await invitationsHandler(
      {
        method: 'DELETE',
        query: { resource: 'invitations', id: createdInv.id },
        url: `/api/users?resource=invitations&id=${createdInv.id}`,
        headers: {
          cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
      } as any,
      delRes
    );
    expect(delRes.statusCode).toBe(200);

    // Verify revoked invitation is no longer listed
    const { res: listAfterRes, getBody: getListAfterBody } = createMockRes();
    await invitationsHandler(
      {
        method: 'GET',
        query: { resource: 'invitations' },
        url: '/api/users?resource=invitations',
        headers: { cookie: `access_token=${accessToken}` },
      } as any,
      listAfterRes
    );
    expect(listAfterRes.statusCode).toBe(200);
    expect(getListAfterBody().invitations.some((i: any) => i.id === createdInv.id)).toBe(false);
  });

  it('non-admin (analyst) cannot create invitations (403)', async () => {
    const { organization, user: analyst } = await UserRepository.createOrganizationWithAdmin({
      auth0Sub: `auth0|nonadmin-seed-${runId}`,
      email: `nonadmin-seed-${runId}@example.test`,
      name: 'Seed Admin',
      organizationName: `Org NonAdmin ${runId}`,
    });
    createdOrgIds.push(organization.id);
    createdUserIds.push(analyst.id);

    const analystUser = await UserRepository.create({
      email: `analyst-inv-${runId}@example.test`,
      name: 'Analyst User',
      role: 'analyst',
      orgId: organization.id,
    });
    createdUserIds.push(analystUser.id);

    const { accessToken, jti } = generateTokens({
      userId: analystUser.id,
      email: analystUser.email,
      role: 'analyst',
      organizationId: organization.id,
    });
    const csrfToken = createCsrfToken(jti);

    const { res, getBody } = createMockRes();
    await invitationsHandler(
      {
        method: 'POST',
        query: { resource: 'invitations' },
        url: '/api/users?resource=invitations',
        headers: {
          cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        body: { role: 'viewer', expiresInHours: 24 },
      } as any,
      res
    );

    expect(res.statusCode).toBe(403);
    expect(getBody().error).toBe('Forbidden');
  });

  it('mixed-case emails normalize consistently and cannot create duplicate accounts', async () => {
    const mixedEmail = `Alice-${runId}@Example.test`;
    const lowerEmail = `alice-${runId}@example.test`;

    const { organization, user } = await UserRepository.createOrganizationWithAdmin({
      auth0Sub: `auth0|alice-${runId}`,
      email: `  ${mixedEmail}  `,
      name: 'Alice Admin',
      organizationName: `Org Alice ${runId}`,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest-agent',
    });
    createdOrgIds.push(organization.id);
    createdUserIds.push(user.id);

    expect(user.email).toBe(lowerEmail);

    const foundUpper = await UserRepository.findByEmail(`ALICE-${runId}@EXAMPLE.TEST`);
    expect(foundUpper?.id).toBe(user.id);

    const foundInOrg = await UserRepository.findByEmailInOrg(`  ${mixedEmail} `, organization.id);
    expect(foundInOrg?.id).toBe(user.id);

    // Attempting to provision another org or Auth0 account with lowercase/mixed-case variant must fail
    await expect(
      UserRepository.createOrganizationWithAdmin({
        auth0Sub: `auth0|alice-dup-${runId}`,
        email: lowerEmail,
        name: 'Alice Dup',
        organizationName: `Org Alice Dup ${runId}`,
      })
    ).rejects.toThrow(/ALREADY_PROVISIONED/);

    await expect(
      UserRepository.resolveAuth0User({
        sub: `auth0|alice-dup2-${runId}`,
        email: `ALICE-${runId}@example.TEST`,
        emailVerified: true,
        orgId: organization.id,
      })
    ).rejects.toThrow(/Account with this email exists/);
  });

  it('POST /api/onboarding returns 403 USER_DEACTIVATED for deactivated users and uniform 409/400 messages without sub/email/inviter enumeration', async () => {
    const activeSub = `auth0|enum-active-${runId}`;
    const activeEmail = `enum-active-${runId}@example.test`;
    const { organization, user: activeAdmin } = await UserRepository.createOrganizationWithAdmin({
      auth0Sub: activeSub,
      email: activeEmail,
      name: 'Active Admin',
      organizationName: `Org Enum ${runId}`,
    });
    createdOrgIds.push(organization.id);
    createdUserIds.push(activeAdmin.id);

    // Deactivated user in the same org
    const deactivatedSub = `auth0|enum-deact-${runId}`;
    const deactivatedEmail = `enum-deact-${runId}@example.test`;
    const deactivatedUser = await prisma.user.create({
      data: {
        auth0Sub: deactivatedSub,
        email: deactivatedEmail,
        emailVerified: true,
        name: 'Deactivated User',
        role: 'analyst',
        orgId: organization.id,
        disabledAt: new Date(),
      },
    });
    createdUserIds.push(deactivatedUser.id);

    const makeOnboardingReq = (sub: string, email: string, body: Record<string, unknown>) => {
      const onboardingCookie = generateOnboardingToken({
        sub,
        email,
        emailVerified: true,
        name: 'Test User',
      });
      const onboardingJti = crypto.createHash('sha256').update(onboardingCookie).digest('hex');
      const onboardingCsrf = createCsrfToken(onboardingJti);
      return {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
          cookie: `onboarding_token=${onboardingCookie}; csrf_token=${onboardingCsrf}`,
          'x-csrf-token': onboardingCsrf,
        },
        body,
      } as any;
    };

    // 1a. Deactivated user matched by sub attempting create_organization -> 403 USER_DEACTIVATED
    const { res: deactSubRes, getBody: getDeactSubBody } = createMockRes();
    await onboardingHandler(
      makeOnboardingReq(deactivatedSub, `other-${runId}@example.test`, {
        action: 'create_organization',
        organizationName: 'Should Fail Org',
      }),
      deactSubRes
    );
    expect(deactSubRes.statusCode).toBe(403);
    expect(getDeactSubBody()).toEqual({
      error: 'Forbidden',
      code: 'USER_DEACTIVATED',
      message: 'Account has been deactivated',
    });

    // 1b. Deactivated user matched by email attempting accept_invitation -> 403 USER_DEACTIVATED
    const { res: deactEmailRes, getBody: getDeactEmailBody } = createMockRes();
    await onboardingHandler(
      makeOnboardingReq(`auth0|new-sub-for-deact-${runId}`, deactivatedEmail, {
        action: 'accept_invitation',
        token: 'unused-token',
      }),
      deactEmailRes
    );
    expect(deactEmailRes.statusCode).toBe(403);
    expect(getDeactEmailBody()).toEqual({
      error: 'Forbidden',
      code: 'USER_DEACTIVATED',
      message: 'Account has been deactivated',
    });

    // 2a. ALREADY_PROVISIONED matched by sub vs email produce the exact same uniform 409 message
    const { res: dupSubRes, getBody: getDupSubBody } = createMockRes();
    await onboardingHandler(
      makeOnboardingReq(activeSub, `different-email-${runId}@example.test`, {
        action: 'create_organization',
        organizationName: 'Dup Sub Org',
      }),
      dupSubRes
    );
    expect(dupSubRes.statusCode).toBe(409);
    expect(getDupSubBody()).toEqual({
      error: 'Conflict',
      code: 'ALREADY_PROVISIONED',
      message: 'Account is already provisioned or cannot be onboarded',
    });

    const { res: dupEmailRes, getBody: getDupEmailBody } = createMockRes();
    await onboardingHandler(
      makeOnboardingReq(`auth0|different-sub-${runId}`, activeEmail, {
        action: 'create_organization',
        organizationName: 'Dup Email Org',
      }),
      dupEmailRes
    );
    expect(dupEmailRes.statusCode).toBe(409);
    expect(getDupEmailBody()).toEqual(getDupSubBody());

    // 2b. Same uniform 409 message for accept_invitation
    const { res: dupInvRes, getBody: getDupInvBody } = createMockRes();
    await onboardingHandler(
      makeOnboardingReq(`auth0|different-sub-2-${runId}`, activeEmail, {
        action: 'accept_invitation',
        token: 'some-token',
      }),
      dupInvRes
    );
    expect(dupInvRes.statusCode).toBe(409);
    expect(getDupInvBody()).toEqual(getDupSubBody());

    // 3. Deactivated inviter produces the exact same uniform 400 message as an invalid token
    const { token: invToken } = await UserRepository.createInvitation({
      orgId: organization.id,
      role: 'viewer',
      createdBy: activeAdmin.id,
      expiresInHours: 24,
    });
    await prisma.user.update({
      where: { id: activeAdmin.id },
      data: { disabledAt: new Date() },
    });

    const { res: deactInvRes, getBody: getDeactInvBody } = createMockRes();
    await onboardingHandler(
      makeOnboardingReq(`auth0|fresh-invitee-${runId}`, `fresh-invitee-${runId}@example.test`, {
        action: 'accept_invitation',
        token: invToken,
      }),
      deactInvRes
    );
    expect(deactInvRes.statusCode).toBe(400);
    expect(getDeactInvBody()).toEqual({
      error: 'Bad Request',
      code: 'INVALID_OR_EXPIRED_INVITATION',
      message: 'Invitation token is invalid, expired, or already used',
    });

    const { res: badTokenRes, getBody: getBadTokenBody } = createMockRes();
    await onboardingHandler(
      makeOnboardingReq(`auth0|fresh-invitee-2-${runId}`, `fresh-invitee-2-${runId}@example.test`, {
        action: 'accept_invitation',
        token: 'definitely-invalid-token',
      }),
      badTokenRes
    );
    expect(badTokenRes.statusCode).toBe(400);
    expect(getBadTokenBody()).toEqual(getDeactInvBody());
  });
});
