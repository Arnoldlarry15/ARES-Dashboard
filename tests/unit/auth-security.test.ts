import { describe, it, expect, vi, afterEach } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import {
  createCsrfToken,
  generateTokens,
  verifyAccessToken,
  verifyCsrfToken
} from '../../services/auth/jwt';
import { requireAuth, type AuthenticatedRequest } from '../../lib/middleware/auth';
import { csrfProtection } from '../../lib/middleware/security';

describe('Authentication & CSRF Security Hardening', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects forged base64 JSON tokens without HS256 signature', () => {
    const forged = Buffer.from(
      JSON.stringify({ userId: 'admin-1', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64');
    expect(verifyAccessToken(forged)).toBeNull();
  });

  it('rejects alg=none JWTs', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ userId: 'admin-1', role: 'admin', iss: 'ares-api', aud: 'ares-dashboard', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    expect(verifyAccessToken(`${header}.${payload}.`)).toBeNull();
  });

  it('rejects local HS256 tokens in production even when validly signed', async () => {
    const { accessToken } = generateTokens({
      userId: 'local-1',
      email: 'dev@local.ares.app',
      role: 'analyst'
    });

    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_LOCAL_AUTH;

    const req: Partial<AuthenticatedRequest> = {
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'POST'
    };
    const res: Partial<VercelResponse> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    await requireAuth(req as AuthenticatedRequest, res as VercelResponse, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('never falls back to valid cookie when Authorization header is invalid', async () => {
    const { accessToken } = generateTokens({
      userId: 'cookie-user',
      email: 'cookie@local.ares.app',
      role: 'analyst'
    });

    const req: Partial<AuthenticatedRequest> = {
      headers: {
        authorization: 'Bearer malformed.token.here',
        cookie: `access_token=${accessToken}`
      },
      method: 'POST'
    };
    const res: Partial<VercelResponse> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    await requireAuth(req as AuthenticatedRequest, res as VercelResponse, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('enforces session-bound HMAC CSRF protection on cookie mutations', () => {
    const { jti } = generateTokens({
      userId: 'u1',
      email: 'u1@local.ares.app',
      role: 'analyst'
    });
    const csrf = createCsrfToken(jti);

    expect(verifyCsrfToken(csrf, csrf, jti)).toBe(true);
    expect(verifyCsrfToken(csrf, csrf, 'different-jti')).toBe(false);

    const reqMissing: Partial<AuthenticatedRequest> = {
      method: 'POST',
      authMethod: 'cookie',
      user: { userId: 'u1', email: 'u1@local.ares.app', role: 'analyst', jti },
      headers: { cookie: `csrf_token=${csrf}` }
    };
    const res: Partial<VercelResponse> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    csrfProtection(reqMissing as AuthenticatedRequest, res as VercelResponse, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    const reqValid: Partial<AuthenticatedRequest> = {
      method: 'POST',
      authMethod: 'cookie',
      user: { userId: 'u1', email: 'u1@local.ares.app', role: 'analyst', jti },
      headers: { cookie: `csrf_token=${csrf}`, 'x-csrf-token': csrf }
    };
    const next2 = vi.fn();
    csrfProtection(reqValid as AuthenticatedRequest, res as VercelResponse, next2);
    expect(next2).toHaveBeenCalled();
  });
});
