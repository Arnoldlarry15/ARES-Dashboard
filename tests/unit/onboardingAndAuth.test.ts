// @vitest-environment node
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const { mockPrismaUser, mockPrismaOrganization, mockPrismaTransaction } = vi.hoisted(() => ({
  mockPrismaUser: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockPrismaOrganization: {
    upsert: vi.fn(),
  },
  mockPrismaTransaction: vi.fn(),
}));

vi.mock('../../utils/db', () => ({
  default: {
    user: mockPrismaUser,
    organization: mockPrismaOrganization,
    $transaction: mockPrismaTransaction,
  },
}));

import * as jwtModule from '../../services/auth/jwt';
import { requireAuth, requireOrganization, type AuthenticatedRequest } from '../../lib/middleware/auth';
import { UserRepository } from '../../repositories/userRepository';
import { AuditLogRepository } from '../../repositories/auditLogRepository';
import loginHandler from '../../api/auth/login';
import onboardingHandler from '../../api/onboarding';
import callbackHandler from '../../api/auth/callback';
import {
  AUTH_ERROR_MESSAGES,
  performOnboardingCompletion,
  resolveCompletedOnboardingUser,
  resolveOnboardingStatusResponse,
} from '../../hooks/useAuthManager';
import { buildOnboardingCompletionPayload } from '../../components/AuthLogin';
import { UserRole } from '../../types/auth';

function createMockRes() {
  const headers: Record<string, string | string[]> = {};
  const res: Partial<VercelResponse> & {
    headers: Record<string, string | string[]>;
    statusCode: number;
    body?: unknown;
  } = {
    headers,
    statusCode: 200,
    setHeader: vi.fn((name: string, value: string | string[]) => {
      headers[name] = value;
      return res as VercelResponse;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res as VercelResponse;
    }),
    json: vi.fn((data: unknown) => {
      res.body = data;
      return res as VercelResponse;
    }),
    end: vi.fn(() => res as VercelResponse),
  };
  return res;
}

function createFakeRs256Jwt(payload: Record<string, unknown> = { sub: 'auth0|rs256-user' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-kid' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

describe('Onboarding & Auth Regressions (Unit)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests-32chars';
    process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-unit-tests-32chars';
    process.env.CSRF_SECRET = 'test-csrf-secret-for-unit-tests-32chars';
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = 'test';
    mockPrismaUser.findUnique.mockReset();
    mockPrismaUser.create.mockReset();
    mockPrismaUser.update.mockReset();
    mockPrismaOrganization.upsert.mockReset();
    mockPrismaOrganization.upsert.mockResolvedValue({ id: 'org_valid123', name: 'Valid Org' });
    mockPrismaTransaction.mockReset();
    mockPrismaTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: mockPrismaUser,
        organization: mockPrismaOrganization,
      })
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('RS256 Bearer & Invalid Bearer Logout', () => {
    it('allows RS256 Bearer logout when verifyAuth0AccessToken succeeds -> 200 and clears cookies', async () => {
      vi.spyOn(jwtModule, 'verifyAuth0AccessToken').mockResolvedValueOnce({
        sub: 'auth0|user-123',
        email: 'user@example.com',
        emailVerified: true,
        name: 'Test User',
      });

      const fakeRs256 = createFakeRs256Jwt();
      const req = {
        method: 'POST',
        query: { provider: 'logout' },
        headers: {
          authorization: `Bearer ${fakeRs256}`,
        },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await loginHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
      const setCookie = res.headers['Set-Cookie'] as string[];
      expect(Array.isArray(setCookie)).toBe(true);
      expect(setCookie.some((c) => c.startsWith('access_token=;'))).toBe(true);
    });

    it('rejects invalid Bearer logout (RS256 or malformed) -> 401 without clearing cookies', async () => {
      vi.spyOn(jwtModule, 'verifyAuth0AccessToken').mockResolvedValueOnce(null);

      const fakeRs256 = createFakeRs256Jwt();
      const req = {
        method: 'POST',
        query: { provider: 'logout' },
        headers: {
          authorization: `Bearer ${fakeRs256}`,
        },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await loginHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.headers['Set-Cookie']).toBeUndefined();
    });

    it('rejects HS256 Bearer logout with invalid signature -> 401 without clearing cookies', async () => {
      const req = {
        method: 'POST',
        query: { provider: 'logout' },
        headers: {
          authorization: 'Bearer invalid.jwt.token',
        },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await loginHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.headers['Set-Cookie']).toBeUndefined();
    });
  });

  describe('requireAuth DB-unavailable 503 & fail-closed behavior', () => {
    it('returns 503 when DATABASE_URL is set and UserRepository.findById throws (no stale JWT fallback)', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/ares_test';
      vi.spyOn(UserRepository, 'findById').mockRejectedValueOnce(new Error('Connection refused'));

      const { accessToken } = jwtModule.generateTokens({
        userId: 'user-1',
        email: 'user1@example.com',
        role: 'admin',
        organizationId: 'org_abc123',
      });

      const req = {
        headers: { authorization: `Bearer ${accessToken}` },
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      await requireAuth(req, res as unknown as VercelResponse, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 503 in production when DATABASE_URL is unset', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      const { accessToken } = jwtModule.generateTokens({
        userId: 'user-1',
        email: 'user1@example.com',
        role: 'analyst',
        organizationId: 'org_abc123',
        authProvider: 'auth0',
      });

      const req = {
        headers: { authorization: `Bearer ${accessToken}` },
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      await requireAuth(req, res as unknown as VercelResponse, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 onboarding_required when RS256 resolveAuth0User throws ONBOARDING_REQUIRED', async () => {
      vi.spyOn(jwtModule, 'verifyAuth0AccessToken').mockResolvedValueOnce({
        sub: 'auth0|new-user',
        email: 'new@example.com',
        emailVerified: true,
      });
      vi.spyOn(UserRepository, 'resolveAuth0User').mockRejectedValueOnce(
        new Error('ONBOARDING_REQUIRED: Explicit organization onboarding or invitation is required')
      );

      const req = {
        headers: { authorization: `Bearer ${createFakeRs256Jwt()}` },
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      await requireAuth(req, res as unknown as VercelResponse, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body).toEqual(
        expect.objectContaining({
          error: 'onboarding_required',
          code: 'ONBOARDING_REQUIRED',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('UserRepository P2002 race recovery & default_org rejection', () => {
    it('recovers from Prisma P2002 unique constraint race in resolveAuth0User', async () => {
      const racedUser = {
        id: 'usr_raced',
        auth0Sub: 'auth0|race-user',
        email: 'race@example.com',
        emailVerified: true,
        name: 'Race User',
        role: 'analyst',
        orgId: 'org_valid123',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: new Date(),
      };

      mockPrismaUser.findUnique
        .mockResolvedValueOnce(null) // existingBySub
        .mockResolvedValueOnce(null) // existingByEmail
        .mockResolvedValueOnce(racedUser as never); // re-fetch after P2002

      mockPrismaUser.create.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
      );

      const user = await UserRepository.resolveAuth0User({
        sub: 'auth0|race-user',
        email: 'race@example.com',
        emailVerified: true,
        name: 'Race User',
        orgId: 'org_valid123',
      });

      expect(user).toEqual(racedUser);
      expect(mockPrismaUser.findUnique).toHaveBeenCalledTimes(3);
    });

    it('rejects default_org in UserRepository.create and resolveAuth0User (new & returning)', async () => {
      await expect(
        UserRepository.create({
          email: 'a@example.com',
          role: 'analyst',
          orgId: 'default_org',
        })
      ).rejects.toThrow(/LEGACY_ORG_MIGRATION_REQUIRED/);

      // Returning user with default_org
      mockPrismaUser.findUnique.mockResolvedValueOnce({
        id: 'usr_legacy',
        auth0Sub: 'auth0|legacy',
        email: 'legacy@example.com',
        emailVerified: true,
        name: 'Legacy',
        role: 'analyst',
        orgId: 'default_org',
      } as never);

      await expect(
        UserRepository.resolveAuth0User({
          sub: 'auth0|legacy',
          email: 'legacy@example.com',
          emailVerified: true,
        })
      ).rejects.toThrow(/LEGACY_ORG_MIGRATION_REQUIRED/);

      // New user with default_org
      mockPrismaUser.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        UserRepository.resolveAuth0User({
          sub: 'auth0|new-legacy',
          email: 'newlegacy@example.com',
          emailVerified: true,
          orgId: 'default_org',
        })
      ).rejects.toThrow(/LEGACY_ORG_MIGRATION_REQUIRED/);
    });

    it('rejects default_org in requireAuth HS256 and requireOrganization', async () => {
      const { accessToken } = jwtModule.generateTokens({
        userId: 'user-legacy',
        email: 'legacy@example.com',
        role: 'analyst',
        organizationId: 'default_org',
      });

      const req = {
        headers: { authorization: `Bearer ${accessToken}` },
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();
      const next = vi.fn();

      await requireAuth(req, res as unknown as VercelResponse, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();

      const orgRes = createMockRes();
      const orgNext = vi.fn();
      requireOrganization()(
        { user: { userId: 'u1', email: 'u1@e.com', role: 'analyst', organizationId: 'default_org' } } as AuthenticatedRequest,
        orgRes as unknown as VercelResponse,
        orgNext
      );
      expect(orgRes.status).toHaveBeenCalledWith(403);
      expect(orgNext).not.toHaveBeenCalled();
    });
  });

  describe('Onboarding HS256 token', () => {
    it('generates and verifies 15-min onboarding token', () => {
      const token = jwtModule.generateOnboardingToken({
        sub: 'auth0|onboard-1',
        email: 'onboard@example.com',
        emailVerified: true,
        name: 'Onboard User',
      });

      const verified = jwtModule.verifyOnboardingToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe('auth0|onboard-1');
      expect(verified?.email).toBe('onboard@example.com');
      expect(verified?.purpose).toBe('onboarding');

      // Regular access token cannot be used as onboarding token
      const { accessToken } = jwtModule.generateTokens({
        userId: 'u1',
        email: 'u1@example.com',
        role: 'analyst',
      });
      expect(jwtModule.verifyOnboardingToken(accessToken)).toBeNull();
    });
  });

  describe('POST /api/onboarding CSRF, Content-Type, and Origin enforcement', () => {
    function issueOnboardingCookies() {
      const onboardingToken = jwtModule.generateOnboardingToken({
        sub: 'auth0|onboard-csrf',
        email: 'onboard-csrf@example.com',
        emailVerified: true,
        name: 'Onboard CSRF User',
      });
      const jti = crypto.createHash('sha256').update(onboardingToken).digest('hex');
      const csrfToken = jwtModule.createCsrfToken(jti);
      return { onboardingToken, jti, csrfToken };
    }

    it('rejects Content-Type: application/x-www-form-urlencoded with 415', async () => {
      const { onboardingToken, csrfToken } = issueOnboardingCookies();
      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: { action: 'create_organization', organizationName: 'Acme' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(415);
    });

    it('rejects Content-Type: text/plain with 415', async () => {
      const { onboardingToken, csrfToken } = issueOnboardingCookies();
      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'text/plain',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: { action: 'create_organization', organizationName: 'Acme' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(415);
    });

    it('rejects cross-origin Origin: https://evil.example with 403', async () => {
      const { onboardingToken, csrfToken } = issueOnboardingCookies();
      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'https://evil.example',
          host: 'localhost:3000',
        },
        body: { action: 'create_organization', organizationName: 'Acme' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects Sec-Fetch-Site: cross-site when Origin is absent with 403', async () => {
      const { onboardingToken, csrfToken } = issueOnboardingCookies();
      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
          'sec-fetch-site': 'cross-site',
          host: 'localhost:3000',
        },
        body: { action: 'create_organization', organizationName: 'Acme' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects cookie-authenticated POST missing X-CSRF-Token with 403', async () => {
      const { onboardingToken, csrfToken } = issueOnboardingCookies();
      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: { action: 'create_organization', organizationName: 'Acme' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('rejects cookie-authenticated POST with mismatched jti CSRF token with 403', async () => {
      const { onboardingToken, csrfToken } = issueOnboardingCookies();
      const wrongCsrf = jwtModule.createCsrfToken('different-jti');
      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': wrongCsrf,
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: { action: 'create_organization', organizationName: 'Acme' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows valid application/json + same-origin + valid X-CSRF-Token -> 201 and clears onboarding cookies', async () => {
      const { onboardingToken, csrfToken } = issueOnboardingCookies();
      const longUa = 'A'.repeat(600);
      const createOrgSpy = vi
        .spyOn(UserRepository, 'createOrganizationWithAdmin')
        .mockResolvedValueOnce({
          organization: {
            id: 'org_new123',
            name: 'Acme',
            createdAt: new Date('2026-01-01T00:00:00Z'),
          } as never,
          user: {
            id: 'usr_new123',
            email: 'onboard-csrf@example.com',
            name: 'Onboard CSRF User',
            role: 'admin',
            orgId: 'org_new123',
          } as never,
        });

      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
          'user-agent': longUa,
        },
        socket: { remoteAddress: '127.0.0.1' },
        body: { action: 'create_organization', organizationName: 'Acme' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(createOrgSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '127.0.0.1',
          userAgent: 'A'.repeat(500),
        })
      );
      const setCookie = res.headers['Set-Cookie'] as string[];
      expect(Array.isArray(setCookie)).toBe(true);
      expect(setCookie.some((c) => c.startsWith('onboarding_token=;'))).toBe(true);
      expect(setCookie.some((c) => c.startsWith('__Host-onboarding_token=;'))).toBe(true);
    });
  });

  describe('Auth audit coupling & callback onboarding CSRF', () => {
    it('returns 403 USER_DEACTIVATED on GET /api/onboarding when user has disabledAt set', async () => {
      const onboardingToken = jwtModule.generateOnboardingToken({
        sub: 'auth0|disabled-user',
        email: 'disabled@example.com',
        emailVerified: true,
        name: 'Disabled User',
      });
      vi.spyOn(UserRepository, 'findByAuth0Sub').mockResolvedValueOnce({
        id: 'usr_disabled',
        auth0Sub: 'auth0|disabled-user',
        email: 'disabled@example.com',
        name: 'Disabled User',
        role: 'analyst',
        orgId: 'org_123',
        disabledAt: new Date('2026-01-01T00:00:00Z'),
      } as never);

      const req = {
        method: 'GET',
        url: '/api/onboarding',
        headers: {
          cookie: `onboarding_token=${onboardingToken}`,
        },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body).toEqual({
        error: 'Forbidden',
        code: 'USER_DEACTIVATED',
        message: 'Account has been deactivated',
      });
    });

    it('returns 403 USER_DEACTIVATED on handleLocalDevLogin when local dev user is deactivated', async () => {
      process.env.ALLOW_LOCAL_AUTH = 'true';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/ares_test';
      vi.spyOn(UserRepository, 'findOrCreateLocalDevUser').mockResolvedValueOnce({
        id: 'usr_local_disabled',
        email: 'dev-analyst@local.ares.app',
        role: 'analyst',
        orgId: 'local_dev_org',
        disabledAt: new Date('2026-01-01T00:00:00Z'),
      } as never);

      const req = {
        method: 'POST',
        query: { provider: 'local' },
        headers: { 'user-agent': 'vitest-agent' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await loginHandler(req, res as unknown as VercelResponse);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.body).toEqual({
        error: 'Forbidden',
        code: 'USER_DEACTIVATED',
        message: 'Account has been deactivated',
      });
      expect(res.headers['Set-Cookie']).toBeUndefined();
    });

    it('fails closed (503) on local dev login when DATABASE_URL is set and AuditLogRepository.create fails inside $transaction', async () => {
      process.env.ALLOW_LOCAL_AUTH = 'true';
      process.env.DATABASE_URL = 'postgresql://localhost:5432/ares_test';
      const findSpy = vi.spyOn(UserRepository, 'findOrCreateLocalDevUser').mockResolvedValueOnce({
        id: 'usr_local',
        email: 'dev-analyst@local.ares.app',
        role: 'analyst',
        orgId: 'local_dev_org',
      } as never);
      const auditSpy = vi
        .spyOn(AuditLogRepository, 'create')
        .mockRejectedValueOnce(new Error('DB write error'));

      const req = {
        method: 'POST',
        query: { provider: 'local' },
        headers: { 'user-agent': 'vitest-agent' },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await loginHandler(req, res as unknown as VercelResponse);

      expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({ user: mockPrismaUser, organization: mockPrismaOrganization })
      );
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_login', actorId: 'usr_local' }),
        expect.objectContaining({ user: mockPrismaUser, organization: mockPrismaOrganization })
      );
      await expect(mockPrismaTransaction.mock.results[0].value).rejects.toThrow('DB write error');
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.headers['Set-Cookie']).toBeUndefined();
    });

    it('rolls back inside $transaction and issues zero session cookies when Auth0 callback audit log fails', async () => {
      process.env.DATABASE_URL = 'postgresql://localhost:5432/ares_test';
      process.env.AUTH0_DOMAIN = 'example.auth0.com';
      process.env.AUTH0_CLIENT_ID = 'client-123';
      process.env.AUTH0_CLIENT_SECRET = 'secret-123';
      process.env.AUTH0_CALLBACK_URL = 'http://localhost:3000/api/auth/callback?provider=auth0';

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'auth0-access-token' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: 'auth0|existing-user',
              email: 'existing@example.com',
              email_verified: true,
              name: 'Existing User',
            }),
            { status: 200 }
          )
        );

      const resolveSpy = vi.spyOn(UserRepository, 'resolveAuth0User').mockResolvedValueOnce({
        id: 'usr_existing',
        auth0Sub: 'auth0|existing-user',
        email: 'existing@example.com',
        emailVerified: true,
        name: 'Existing User',
        role: 'analyst',
        orgId: 'org_valid123',
      } as never);
      const auditSpy = vi
        .spyOn(AuditLogRepository, 'create')
        .mockRejectedValueOnce(new Error('Audit write failed'));

      const req = {
        method: 'GET',
        query: { provider: 'auth0', code: 'code-123', state: 'state-123' },
        headers: { cookie: 'auth0_state=state-123', 'user-agent': 'vitest-agent' },
      } as unknown as VercelRequest;
      const res = createMockRes();
      res.redirect = vi.fn(() => res as VercelResponse) as unknown as VercelResponse['redirect'];

      await callbackHandler(req, res as unknown as VercelResponse);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
      expect(resolveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'auth0|existing-user' }),
        expect.objectContaining({ user: mockPrismaUser, organization: mockPrismaOrganization })
      );
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'user_login', actorId: 'usr_existing' }),
        expect.objectContaining({ user: mockPrismaUser, organization: mockPrismaOrganization })
      );
      await expect(mockPrismaTransaction.mock.results[0].value).rejects.toThrow('Audit write failed');
      expect(res.headers['Set-Cookie']).toBeUndefined();
      expect(res.redirect).toHaveBeenCalledWith('/?error=authentication_failed');
    });

    it('issues session-bound csrf_token alongside onboarding_token in Auth0 callback', async () => {
      process.env.AUTH0_DOMAIN = 'example.auth0.com';
      process.env.AUTH0_CLIENT_ID = 'client-123';
      process.env.AUTH0_CLIENT_SECRET = 'secret-123';
      process.env.AUTH0_CALLBACK_URL = 'http://localhost:3000/api/auth/callback?provider=auth0';

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ access_token: 'auth0-access-token' }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: 'auth0|new-user',
              email: 'new-user@example.com',
              email_verified: true,
              name: 'New User',
            }),
            { status: 200 }
          )
        );

      vi.spyOn(UserRepository, 'resolveAuth0User').mockRejectedValueOnce(
        new Error('ONBOARDING_REQUIRED: Explicit organization onboarding or invitation is required')
      );

      const req = {
        method: 'GET',
        query: { provider: 'auth0', code: 'code-123', state: 'state-123' },
        headers: { cookie: 'auth0_state=state-123' },
      } as unknown as VercelRequest;
      const res = createMockRes();
      res.redirect = vi.fn(() => res as VercelResponse) as unknown as VercelResponse['redirect'];

      await callbackHandler(req, res as unknown as VercelResponse);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(res.redirect).toHaveBeenCalledWith(302, '/?onboarding=required');
      const setCookie = res.headers['Set-Cookie'] as string[];
      const onboardingCookie = setCookie.find((c) => c.startsWith('onboarding_token='))!;
      const csrfCookie = setCookie.find((c) => c.startsWith('csrf_token='))!;
      expect(onboardingCookie).toBeDefined();
      expect(csrfCookie).toBeDefined();
      const onboardingVal = onboardingCookie.split(';')[0].split('=')[1];
      const csrfVal = csrfCookie.split(';')[0].split('=')[1];
      const jti = crypto.createHash('sha256').update(onboardingVal).digest('hex');
      expect(jwtModule.verifyCsrfToken(csrfVal, csrfVal, jti)).toBe(true);
    });
  });

  describe('useAuthManager onboarding status resolution', () => {
    it('resolves provisioned status with organizationId', () => {
      const res = resolveOnboardingStatusResponse(200, {
        status: 'provisioned',
        user: {
          id: 'usr_1',
          email: 'u1@example.com',
          name: 'User One',
          role: UserRole.ADMIN,
          organizationId: 'org_123',
        },
      });
      expect(res.outcome).toBe('provisioned');
      if (res.outcome === 'provisioned') {
        expect(res.user.organization_id).toBe('org_123');
      }
    });

    it('resolves 403 LEGACY_ORG_MIGRATION_REQUIRED without trapping in onboarding', () => {
      const res = resolveOnboardingStatusResponse(403, {
        code: 'LEGACY_ORG_MIGRATION_REQUIRED',
      });
      expect(res).toEqual({
        outcome: 'legacy_org_migration_required',
        authError: AUTH_ERROR_MESSAGES.legacy_org_migration_required,
      });
    });

    it('falls back to onboarding_required for unprovisioned status', () => {
      const res = resolveOnboardingStatusResponse(200, {
        status: 'onboarding_required',
      });
      expect(res).toEqual({ outcome: 'onboarding_required' });
    });
  });

  describe('Onboarding completion organization context hydration (Pass 1.13)', () => {
    it('hydrates currentUser.organization_id from accept_invitation { user: { ..., organizationId } }', () => {
      const apiResponse = {
        user: {
          id: 'usr_invited_admin',
          email: 'invited-admin@example.com',
          name: 'Invited Admin',
          role: UserRole.ADMIN,
          organizationId: 'org_invited_999',
        },
      };

      const completionPayload = buildOnboardingCompletionPayload(apiResponse);
      expect(completionPayload.organizationId).toBe('org_invited_999');

      const currentUser = resolveCompletedOnboardingUser(completionPayload, null);
      expect(currentUser).not.toBeNull();
      expect(currentUser?.id).toBe('usr_invited_admin');
      expect(currentUser?.role).toBe(UserRole.ADMIN);
      expect(currentUser?.organization_id).toBe('org_invited_999');
    });

    it('hydrates organization_id when resolveCompletedOnboardingUser is called directly with user.organizationId', () => {
      const currentUser = resolveCompletedOnboardingUser(
        {
          user: {
            id: 'usr_direct',
            email: 'direct-admin@example.com',
            name: 'Direct Admin',
            role: UserRole.ADMIN,
            organizationId: 'org_direct_456',
          },
        },
        null
      );

      expect(currentUser?.organization_id).toBe('org_direct_456');
      expect(currentUser?.role).toBe(UserRole.ADMIN);
    });

    it('allows an invited administrator to immediately access TeamManagement without refreshing', async () => {
      const onboardingToken = jwtModule.generateOnboardingToken({
        sub: 'auth0|invited-admin',
        email: 'invited-admin@example.com',
        emailVerified: true,
        name: 'Invited Admin',
      });
      const jti = crypto.createHash('sha256').update(onboardingToken).digest('hex');
      const csrfToken = jwtModule.createCsrfToken(jti);

      vi.spyOn(UserRepository, 'acceptInvitation').mockResolvedValueOnce({
        user: {
          id: 'usr_invited_admin',
          email: 'invited-admin@example.com',
          name: 'Invited Admin',
          role: UserRole.ADMIN,
          orgId: 'org_team_777',
        },
      } as never);

      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: {
          action: 'accept_invitation',
          token: 'invite-token-abc',
        },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      const completionPayload = buildOnboardingCompletionPayload(res.body);
      const currentUser = resolveCompletedOnboardingUser(completionPayload, null);

      // TeamManagement checks `currentUser?.organization_id` (and App gates admin access on role + org)
      expect(currentUser?.role).toBe(UserRole.ADMIN);
      expect(currentUser?.organization_id).toBe('org_team_777');
    });

    it('continues to hydrate organization_id for create_organization responses', async () => {
      const onboardingToken = jwtModule.generateOnboardingToken({
        sub: 'auth0|new-admin',
        email: 'new-admin@example.com',
        emailVerified: true,
        name: 'New Admin',
      });
      const jti = crypto.createHash('sha256').update(onboardingToken).digest('hex');
      const csrfToken = jwtModule.createCsrfToken(jti);

      vi.spyOn(UserRepository, 'createOrganizationWithAdmin').mockResolvedValueOnce({
        organization: {
          id: 'org_created_321',
          name: 'Created Org',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        user: {
          id: 'usr_new_admin',
          email: 'new-admin@example.com',
          name: 'New Admin',
          role: UserRole.ADMIN,
          orgId: 'org_created_321',
        },
      } as never);

      const req = {
        method: 'POST',
        url: '/api/onboarding',
        headers: {
          'content-type': 'application/json',
          cookie: `onboarding_token=${onboardingToken}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: {
          action: 'create_organization',
          organizationName: 'Created Org',
        },
      } as unknown as VercelRequest;
      const res = createMockRes();

      await onboardingHandler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(201);
      const completionPayload = buildOnboardingCompletionPayload(res.body);
      expect(completionPayload.organizationId).toBe('org_created_321');

      const currentUser = resolveCompletedOnboardingUser(completionPayload, null);
      expect(currentUser?.role).toBe(UserRole.ADMIN);
      expect(currentUser?.organization_id).toBe('org_created_321');
    });

    it('awaits getAccessTokenSilently({ cacheMode: "off" }) before calling setOnboardingRequired(false)', async () => {
      const events: string[] = [];
      let resolveToken!: (token: string) => void;
      const tokenPromise = new Promise<string>((resolve) => {
        resolveToken = resolve;
      });

      const getAccessTokenSilently = vi.fn(async (opts?: { cacheMode?: 'off' | 'on' | 'cache-only' }) => {
        events.push(`token_start:${opts?.cacheMode}`);
        const token = await tokenPromise;
        events.push('token_resolved');
        return token;
      });
      const setOnboardingRequired = vi.fn((required: boolean) => {
        events.push(`setOnboardingRequired:${required}`);
      });
      const setOnboardingCompletedInSession = vi.fn();
      const setLocalUser = vi.fn();
      const setIsLocalAuth = vi.fn();

      const completionPromise = performOnboardingCompletion({
        payload: {
          user: {
            id: 'usr_1',
            email: 'u1@example.com',
            role: UserRole.ADMIN,
            organizationId: 'org_123',
          },
        },
        localUser: null,
        auth0Configured: true,
        auth0Authenticated: true,
        getAccessTokenSilently,
        setOnboardingCompletedInSession,
        setOnboardingRequired,
        setLocalUser,
        setIsLocalAuth,
      });

      // Wait a microtask to ensure getAccessTokenSilently has been invoked
      await Promise.resolve();
      expect(getAccessTokenSilently).toHaveBeenCalledWith({ cacheMode: 'off' });
      expect(setOnboardingRequired).not.toHaveBeenCalled();

      resolveToken('fresh-access-token');
      await completionPromise;

      expect(events).toEqual([
        'token_start:off',
        'token_resolved',
        'setOnboardingRequired:false',
      ]);
      expect(setOnboardingRequired).toHaveBeenCalledWith(false);
    });
  });
});
