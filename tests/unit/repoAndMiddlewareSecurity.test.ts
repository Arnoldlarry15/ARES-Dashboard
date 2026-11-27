import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { cors, securityHeaders } from '../../lib/middleware/security';
import metricsHandler from '../../api/metrics';

function createMockRes() {
  const headers: Record<string, string> = {};
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    setHeader: vi.fn((name: string, val: string | number | readonly string[]) => {
      headers[name.toLowerCase()] = String(val);
      return res as VercelResponse;
    }),
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis()
  };
  return { res: res as VercelResponse, headers };
}

describe('Repository, CORS, Security Headers & Metrics Hardening', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('does not fall back to wildcard "*" for disallowed origins when allowlist is configured', () => {
    const mw = cors({ origin: ['https://app.ares.sec'], credentials: true });
    const req: any = { method: 'GET', headers: { origin: 'https://evil.example' } };
    const { res, headers } = createMockRes();
    const next = vi.fn();

    mw(req, res, next);
    expect(headers['access-control-allow-origin']).toBeUndefined();
    expect(headers['access-control-allow-credentials']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('allows configured origin with credentials and X-CSRF-Token header', () => {
    const mw = cors({ origin: ['https://app.ares.sec'], credentials: true });
    const req: any = { method: 'OPTIONS', headers: { origin: 'https://app.ares.sec' } };
    const { res, headers } = createMockRes();
    const next = vi.fn();

    mw(req, res, next);
    expect(headers['access-control-allow-origin']).toBe('https://app.ares.sec');
    expect(headers['access-control-allow-credentials']).toBe('true');
    expect(headers['access-control-allow-headers']).toContain('X-CSRF-Token');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('never pairs wildcard "*" with Access-Control-Allow-Credentials: true', () => {
    const mw = cors({ origin: '*', credentials: true });
    const req: any = { method: 'GET', headers: { origin: 'https://any.example' } };
    const { res, headers } = createMockRes();
    mw(req, res, vi.fn());
    expect(headers['access-control-allow-origin']).toBeUndefined();
    expect(headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('sets HSTS in production alongside core security headers', () => {
    process.env.NODE_ENV = 'production';
    const req: any = { method: 'GET', headers: {} };
    const { res, headers } = createMockRes();
    securityHeaders(req, res, vi.fn());

    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['strict-transport-security']).toContain('max-age=31536000');
  });

  it('fails closed on /api/metrics in production when METRICS_AUTH is unset', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.METRICS_AUTH;
    const req: any = { method: 'GET', headers: {} };
    const { res } = createMockRes();
    await metricsHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('enforces least-privilege GitHub workflow configuration and .gitignore secret exclusions', () => {
    const root = process.cwd();
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);

    const workflowsDir = path.join(root, '.github', 'workflows');
    for (const file of fs.readdirSync(workflowsDir)) {
      const yml = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      expect(yml).not.toContain('pull_request_target');
      expect(yml).toContain('persist-credentials: false');
      expect(yml).toMatch(/permissions:\s*\r?\n\s*contents:\s*read/);
      const usesMatches = [...yml.matchAll(/uses:\s*([^\s#]+)/g)].map(m => m[1]);
      expect(usesMatches.length).toBeGreaterThan(0);
      for (const ref of usesMatches) {
        expect(ref).toMatch(/@[0-9a-f]{40}$/);
      }
    }

    const ciYml = fs.readFileSync(path.join(workflowsDir, 'ci.yml'), 'utf8');
    expect(ciYml).toContain('dependency-review-action');
  });
});
