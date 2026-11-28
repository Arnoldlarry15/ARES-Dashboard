import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/auth/login';
import { createCsrfToken, generateTokens } from '../../services/auth/jwt';
import { csrfProtection } from '../../lib/middleware/security';
import type { AuthenticatedRequest } from '../../lib/middleware/auth';

function createMockRes() {
  const headers: Record<string, string | string[]> = {};
  const res: Partial<VercelResponse> & {
    headers: Record<string, string | string[]>;
    writableEnded: boolean;
  } = {
    headers,
    writableEnded: false,
    setHeader: vi.fn((name: string, value: string | string[]) => {
      headers[name] = value;
      return res as VercelResponse;
    }),
    status: vi.fn((_code: number) => res as VercelResponse),
    json: vi.fn((_body: unknown) => {
      res.writableEnded = true;
      return res as VercelResponse;
    }),
    end: vi.fn(() => {
      res.writableEnded = true;
      return res as VercelResponse;
    }),
  };
  return res;
}

describe('Logout & CSRF Protection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-unit-tests';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-jwt-refresh-secret-for-unit-tests';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('(1) allows authenticated logout with valid CSRF token -> 200 and clears cookies', async () => {
    const { accessToken, jti } = generateTokens({
      userId: 'user-1',
      email: 'user1@local.ares.app',
      role: 'analyst',
    });
    const csrfToken = createCsrfToken(jti);

    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    const setCookie = res.headers['Set-Cookie'] as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie).toHaveLength(8);
    expect(setCookie.some((c) => c.startsWith('access_token=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('__Host-access_token=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('refresh_token=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('__Host-refresh_token=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('csrf_token=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('__Host-csrf_token=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('onboarding_token=;'))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('__Host-onboarding_token=;'))).toBe(true);
  });

  it('(2) rejects active session logout with missing CSRF token -> 403 and cookies NOT cleared', async () => {
    const { accessToken, jti } = generateTokens({
      userId: 'user-2',
      email: 'user2@local.ares.app',
      role: 'analyst',
    });
    const csrfToken = createCsrfToken(jti);

    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Invalid or missing CSRF token',
    });
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('(3) rejects active session logout with invalid CSRF token -> 403 and cookies NOT cleared', async () => {
    const { accessToken, jti } = generateTokens({
      userId: 'user-3',
      email: 'user3@local.ares.app',
      role: 'analyst',
    });
    const csrfToken = createCsrfToken(jti);
    const otherSessionCsrf = createCsrfToken('different-jti');

    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        cookie: `__Host-access_token=${accessToken}; __Host-csrf_token=${csrfToken}`,
        'x-csrf-token': otherSessionCsrf,
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Invalid or missing CSRF token',
    });
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('(4) allows idempotent cookie clear for expired/invalid session token -> 200', async () => {
    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        cookie: 'access_token=expired.or.invalid.jwt',
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(Array.isArray(res.headers['Set-Cookie'])).toBe(true);
    expect((res.headers['Set-Cookie'] as string[]).length).toBe(8);
  });

  it('(5) allows repeated logout with no cookies -> 200 idempotent', async () => {
    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {},
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    expect(Array.isArray(res.headers['Set-Cookie'])).toBe(true);
    expect((res.headers['Set-Cookie'] as string[]).length).toBe(8);
  });

  it('(6) sets proper cookie attributes (HttpOnly, SameSite=Lax, conditional Secure in prod)', async () => {
    // Non-production: non-__Host- cookies should not require Secure, __Host- cookies always have Secure
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;

    const devReq = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {},
    } as unknown as VercelRequest;
    const devRes = createMockRes();
    await handler(devReq, devRes as unknown as VercelResponse);

    const devCookies = devRes.headers['Set-Cookie'] as string[];
    const devAccess = devCookies.find((c) => c.startsWith('access_token=;'))!;
    const devRefresh = devCookies.find((c) => c.startsWith('refresh_token=;'))!;
    const devCsrf = devCookies.find((c) => c.startsWith('csrf_token=;'))!;
    const devOnboarding = devCookies.find((c) => c.startsWith('onboarding_token=;'))!;
    const devHostOnboarding = devCookies.find((c) => c.startsWith('__Host-onboarding_token=;'))!;
    expect(devAccess).toContain('HttpOnly');
    expect(devAccess).toContain('SameSite=Lax');
    expect(devAccess).not.toContain('Secure');
    expect(devRefresh).toContain('HttpOnly');
    expect(devRefresh).toContain('SameSite=Lax');
    expect(devCsrf).toContain('SameSite=Lax');
    expect(devOnboarding).toContain('HttpOnly');
    expect(devOnboarding).toContain('SameSite=Lax');
    expect(devOnboarding).not.toContain('Secure');
    expect(devHostOnboarding).toContain('HttpOnly');
    expect(devHostOnboarding).toContain('SameSite=Lax');
    expect(devHostOnboarding).toContain('Secure');

    // Production: all cleared cookies must include Secure
    process.env.NODE_ENV = 'production';
    const prodReq = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {},
    } as unknown as VercelRequest;
    const prodRes = createMockRes();
    await handler(prodReq, prodRes as unknown as VercelResponse);

    const prodCookies = prodRes.headers['Set-Cookie'] as string[];
    expect(prodCookies).toHaveLength(8);
    for (const cookie of prodCookies) {
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('Max-Age=0');
    }
    expect(prodCookies.find((c) => c.startsWith('access_token=;'))).toContain('HttpOnly');
    expect(prodCookies.find((c) => c.startsWith('__Host-access_token=;'))).toContain('HttpOnly');
    expect(prodCookies.find((c) => c.startsWith('refresh_token=;'))).toContain('HttpOnly');
    expect(prodCookies.find((c) => c.startsWith('__Host-refresh_token=;'))).toContain('HttpOnly');
    expect(prodCookies.find((c) => c.startsWith('onboarding_token=;'))).toContain('HttpOnly');
    expect(prodCookies.find((c) => c.startsWith('__Host-onboarding_token=;'))).toContain('HttpOnly');
  });

  it('(7) keeps CSRF protection on other mutating actions intact', () => {
    const { jti } = generateTokens({
      userId: 'user-7',
      email: 'user7@local.ares.app',
      role: 'analyst',
    });
    const csrfToken = createCsrfToken(jti);

    const reqMissing = {
      method: 'POST',
      url: '/api/campaigns',
      authMethod: 'cookie',
      user: { userId: 'user-7', email: 'user7@local.ares.app', role: 'analyst', jti },
      headers: { cookie: `csrf_token=${csrfToken}` },
    } as unknown as AuthenticatedRequest;
    const resMissing = createMockRes();
    const nextMissing = vi.fn();

    csrfProtection(reqMissing, resMissing as unknown as VercelResponse, nextMissing);
    expect(resMissing.status).toHaveBeenCalledWith(403);
    expect(nextMissing).not.toHaveBeenCalled();

    const reqValid = {
      method: 'POST',
      url: '/api/campaigns',
      authMethod: 'cookie',
      user: { userId: 'user-7', email: 'user7@local.ares.app', role: 'analyst', jti },
      headers: { cookie: `csrf_token=${csrfToken}`, 'x-csrf-token': csrfToken },
    } as unknown as AuthenticatedRequest;
    const resValid = createMockRes();
    const nextValid = vi.fn();

    csrfProtection(reqValid, resValid as unknown as VercelResponse, nextValid);
    expect(nextValid).toHaveBeenCalledTimes(1);
    expect(resValid.status).not.toHaveBeenCalled();
  });

  it('(8) rejects expired access_token + valid refresh_token without CSRF -> 403 and cookies NOT cleared', async () => {
    const { refreshToken, jti } = generateTokens({
      userId: 'user-8',
      email: 'user8@local.ares.app',
      role: 'analyst',
    });
    const csrfToken = createCsrfToken(jti);

    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        cookie: `access_token=expired.or.invalid.jwt; refresh_token=${refreshToken}; csrf_token=${csrfToken}`,
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Invalid or missing CSRF token',
    });
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('(9) allows expired access_token + valid refresh_token WITH valid CSRF -> 200 and clears cookies', async () => {
    const { refreshToken, jti } = generateTokens({
      userId: 'user-9',
      email: 'user9@local.ares.app',
      role: 'analyst',
    });
    const csrfToken = createCsrfToken(jti);

    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        cookie: `access_token=expired.or.invalid.jwt; __Host-refresh_token=${refreshToken}; __Host-csrf_token=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    const setCookie = res.headers['Set-Cookie'] as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie).toHaveLength(8);
  });

  it('(10) rejects invalid Authorization: Bearer bad even with valid session cookies -> 401 and cookies NOT cleared', async () => {
    const { accessToken, refreshToken, jti } = generateTokens({
      userId: 'user-10',
      email: 'user10@local.ares.app',
      role: 'analyst',
    });
    const csrfToken = createCsrfToken(jti);

    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        authorization: 'Bearer bad',
        cookie: `access_token=${accessToken}; refresh_token=${refreshToken}; csrf_token=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Invalid or expired authorization token',
    });
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('(11) rejects Authorization header missing Bearer prefix -> 401 and cookies NOT cleared', async () => {
    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        authorization: 'Basic dXNlcjpwYXNz',
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('(12) allows valid Authorization: Bearer <token> -> 200 and clears cookies', async () => {
    const { accessToken } = generateTokens({
      userId: 'user-12',
      email: 'user12@local.ares.app',
      role: 'analyst',
    });

    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true });
    const setCookie = res.headers['Set-Cookie'] as string[];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie).toHaveLength(8);
  });

  it('(13) rejects logout when csrf_token cookie exists without matching X-CSRF-Token even if session cookies are invalid -> 403', async () => {
    const req = {
      method: 'POST',
      query: { provider: 'logout' },
      headers: {
        cookie: 'access_token=expired.or.invalid.jwt; csrf_token=some-csrf-token',
      },
    } as unknown as VercelRequest;
    const res = createMockRes();

    await handler(req, res as unknown as VercelResponse);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});
