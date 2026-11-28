import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { generateTokens } from '../../services/auth/jwt';

const { mockUsers, mockCampaigns, mockAuditLogs, mockPrisma } = vi.hoisted(() => {
  const mockUsers = new Map<string, any>();
  const mockCampaigns = new Map<string, any>();
  const mockAuditLogs: any[] = [];

  function projectCreator(user: any, creatorInclude: any) {
    if (!user) return null;
    if (creatorInclude?.select) {
      const projected: Record<string, any> = {};
      for (const [key, enabled] of Object.entries(creatorInclude.select)) {
        if (enabled) projected[key] = user[key];
      }
      return projected;
    }
    return { ...user };
  }

  function matchesUserWhere(user: any, where: any): boolean {
    if (!where) return true;
    if (where.id !== undefined) {
      if (typeof where.id === 'object' && where.id !== null && 'not' in where.id) {
        if (user.id === where.id.not) return false;
      } else if (user.id !== where.id) {
        return false;
      }
    }
    if (where.email !== undefined && user.email !== where.email) return false;
    if (where.auth0Sub !== undefined && user.auth0Sub !== where.auth0Sub) return false;
    if (where.orgId !== undefined && user.orgId !== where.orgId) return false;
    if (where.role !== undefined && user.role !== where.role) return false;
    if (where.disabledAt !== undefined) {
      if (where.disabledAt === null && (user.disabledAt ?? null) !== null) return false;
      if (where.disabledAt !== null && user.disabledAt !== where.disabledAt) return false;
    }
    return true;
  }

  function matchesCampaignWhere(campaign: any, where: any): boolean {
    if (!where) return true;
    if (where.AND && Array.isArray(where.AND)) {
      return where.AND.every((clause: any) => matchesCampaignWhere(campaign, clause));
    }
    if (where.OR && Array.isArray(where.OR)) {
      return where.OR.some((clause: any) => matchesCampaignWhere(campaign, clause));
    }
    if (where.id !== undefined && campaign.id !== where.id) {
      return false;
    }
    if (where.createdBy !== undefined && campaign.createdBy !== where.createdBy) {
      return false;
    }
    if (where.creator?.orgId !== undefined) {
      const creator = mockUsers.get(campaign.createdBy);
      if (!creator || creator.orgId !== where.creator.orgId) {
        return false;
      }
    }
    if (where.name?.contains !== undefined) {
      const q = String(where.name.contains).toLowerCase();
      if (!String(campaign.name || '').toLowerCase().includes(q)) return false;
    }
    if (where.description?.contains !== undefined) {
      const q = String(where.description.contains).toLowerCase();
      if (!String(campaign.description || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }

  function matchesAuditWhere(log: any, where: any): boolean {
    if (!where) return true;
    if (where.orgId !== undefined && log.orgId !== where.orgId) {
      return false;
    }
    if (where.actorId !== undefined && log.actorId !== where.actorId) {
      return false;
    }
    if (where.actor?.orgId !== undefined) {
      const actor = mockUsers.get(log.actorId);
      if (!actor || actor.orgId !== where.actor.orgId) {
        return false;
      }
    }
    if (where.action !== undefined && log.action !== where.action) {
      return false;
    }
    return true;
  }

  const mockPrisma: any = {
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    $executeRaw: vi.fn(async () => 1),
    organization: {
      upsert: vi.fn(async ({ create }: any) => ({ ...create })),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        for (const u of mockUsers.values()) {
          if (matchesUserWhere(u, where)) return { ...u };
        }
        return null;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        for (const u of mockUsers.values()) {
          if (matchesUserWhere(u, where)) return { ...u };
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: any = {}) => {
        return Array.from(mockUsers.values())
          .filter(u => matchesUserWhere(u, where))
          .map(u => ({ ...u }));
      }),
      create: vi.fn(async ({ data }: any) => {
        const u = { id: `u_${mockUsers.size + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        mockUsers.set(u.id, u);
        return { ...u };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const u = mockUsers.get(where.id);
        if (!u) return null;
        Object.assign(u, data, { updatedAt: new Date() });
        return { ...u };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const u of mockUsers.values()) {
          if (matchesUserWhere(u, where)) {
            Object.assign(u, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const [id, u] of Array.from(mockUsers.entries())) {
          if (matchesUserWhere(u, where)) {
            mockUsers.delete(id);
            count++;
          }
        }
        return { count };
      }),
      count: vi.fn(async ({ where }: any = {}) => {
        return Array.from(mockUsers.values()).filter(u => matchesUserWhere(u, where)).length;
      }),
    },
    campaign: {
      findUnique: vi.fn(async ({ where, include }: any) => {
        const c = mockCampaigns.get(where.id);
        if (!c) return null;
        if (include?.creator) {
          return { ...c, creator: projectCreator(mockUsers.get(c.createdBy), include.creator) };
        }
        return { ...c };
      }),
      findFirst: vi.fn(async ({ where, include }: any) => {
        for (const c of mockCampaigns.values()) {
          if (matchesCampaignWhere(c, where)) {
            return include?.creator
              ? { ...c, creator: projectCreator(mockUsers.get(c.createdBy), include.creator) }
              : { ...c };
          }
        }
        return null;
      }),
      findMany: vi.fn(async ({ where, include }: any = {}) => {
        return Array.from(mockCampaigns.values())
          .filter(c => matchesCampaignWhere(c, where))
          .map(c => (include?.creator ? { ...c, creator: projectCreator(mockUsers.get(c.createdBy), include.creator) } : { ...c }));
      }),
      create: vi.fn(async ({ data, include }: any) => {
        const c = { id: `camp_${mockCampaigns.size + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        mockCampaigns.set(c.id, c);
        return include?.creator ? { ...c, creator: projectCreator(mockUsers.get(c.createdBy), include.creator) } : { ...c };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const c of mockCampaigns.values()) {
          if (matchesCampaignWhere(c, where)) {
            Object.assign(c, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        let count = 0;
        for (const [id, c] of Array.from(mockCampaigns.entries())) {
          if (matchesCampaignWhere(c, where)) {
            mockCampaigns.delete(id);
            count++;
          }
        }
        return { count };
      }),
      count: vi.fn(async ({ where }: any = {}) => {
        return Array.from(mockCampaigns.values()).filter(c => matchesCampaignWhere(c, where)).length;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data, include }: any) => {
        const log = { id: `log_${mockAuditLogs.length + 1}`, timestamp: new Date(), ...data };
        mockAuditLogs.push(log);
        return include?.actor ? { ...log, actor: mockUsers.get(log.actorId) || null } : { ...log };
      }),
      findMany: vi.fn(async ({ where, include }: any = {}) => {
        return mockAuditLogs
          .filter(l => matchesAuditWhere(l, where))
          .map(l => (include?.actor ? { ...l, actor: mockUsers.get(l.actorId) || null } : { ...l }));
      }),
      count: vi.fn(async ({ where }: any = {}) => {
        return mockAuditLogs.filter(l => matchesAuditWhere(l, where)).length;
      }),
    },
  };

  return { mockUsers, mockCampaigns, mockAuditLogs, mockPrisma };
});

vi.mock('../../utils/db', () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

import campaignsHandler from '../../api/campaigns';
import auditLogsHandler from '../../api/audit-logs';
import usersHandler from '../../api/users';
import { UserRepository } from '../../repositories/userRepository';

function createMockRes() {
  let body: any;
  const res: Partial<VercelResponse> = {
    statusCode: 200,
    setHeader: vi.fn().mockReturnThis(),
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn((data: any) => {
      body = data;
      return res as VercelResponse;
    }),
    end: vi.fn().mockReturnThis(),
  };
  return { res: res as VercelResponse, getBody: () => body };
}

function authHeaderFor(userId: string) {
  const user = mockUsers.get(userId)!;
  const { accessToken } = generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.orgId,
  });
  return `Bearer ${accessToken}`;
}

describe('Tenant Isolation & Fail-Closed Organization Authorization', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockUsers.clear();
    mockCampaigns.clear();
    mockAuditLogs.length = 0;
    vi.clearAllMocks();

    process.env.JWT_SECRET = 'test-jwt-secret-must-be-32-chars-minimum';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-minimum';
    process.env.CSRF_SECRET = 'test-csrf-secret-32-chars-minimum';
    process.env.NODE_ENV = 'test';

    // Org A users
    mockUsers.set('orgA-admin', { id: 'orgA-admin', email: 'admin@orga.sec', role: 'admin', orgId: 'org-a', auth0Sub: 'auth0|orga-admin-sub' });
    mockUsers.set('orgA-lead', { id: 'orgA-lead', email: 'lead@orga.sec', role: 'red_team_lead', orgId: 'org-a' });
    mockUsers.set('orgA-analyst-1', { id: 'orgA-analyst-1', email: 'a1@orga.sec', role: 'analyst', orgId: 'org-a', auth0Sub: 'auth0|orga-a1-sub' });
    mockUsers.set('orgA-analyst-2', { id: 'orgA-analyst-2', email: 'a2@orga.sec', role: 'analyst', orgId: 'org-a' });

    // Org B users
    mockUsers.set('orgB-admin', { id: 'orgB-admin', email: 'admin@orgb.sec', role: 'admin', orgId: 'org-b' });
    mockUsers.set('orgB-analyst', { id: 'orgB-analyst', email: 'a1@orgb.sec', role: 'analyst', orgId: 'org-b' });

    // User with missing/empty orgId
    mockUsers.set('no-org-admin', { id: 'no-org-admin', email: 'noorg@sec.local', role: 'admin', orgId: '' });
    mockUsers.set('ws-org-admin', { id: 'ws-org-admin', email: 'wsorg@sec.local', role: 'admin', orgId: '   ' });

    // Campaigns
    mockCampaigns.set('camp-a1', {
      id: 'camp-a1',
      name: 'Org A Alpha Campaign',
      description: 'Prompt injection test',
      framework: 'OWASP_LLM',
      tacticId: 'LLM01',
      tacticName: 'Prompt Injection',
      createdBy: 'orgA-analyst-1',
    });
    mockCampaigns.set('camp-a2', {
      id: 'camp-a2',
      name: 'Org A Second Campaign',
      description: 'Data leakage test',
      framework: 'OWASP_LLM',
      tacticId: 'LLM06',
      tacticName: 'Sensitive Info Disclosure',
      createdBy: 'orgA-analyst-2',
    });
    mockCampaigns.set('camp-b1', {
      id: 'camp-b1',
      name: 'Org B Secret Campaign',
      description: 'Prompt injection test',
      framework: 'OWASP_LLM',
      tacticId: 'LLM01',
      tacticName: 'Prompt Injection',
      createdBy: 'orgB-analyst',
    });

    // Audit logs
    mockAuditLogs.push(
      { id: 'log-a1', orgId: 'org-a', actorId: 'orgA-analyst-1', action: 'campaign_created', target: 'camp-a1', timestamp: new Date() },
      { id: 'log-a2', orgId: 'org-a', actorId: 'orgA-analyst-2', action: 'campaign_updated', target: 'camp-a2', timestamp: new Date() },
      { id: 'log-b1', orgId: 'org-b', actorId: 'orgB-analyst', action: 'campaign_created', target: 'camp-b1', timestamp: new Date() }
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('(1) Org A admin cannot read Org B campaigns', async () => {
    const auth = authHeaderFor('orgA-admin');

    // Direct GET ?id=camp-b1 (normalized 404, indistinguishable from non-existent)
    const r1 = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: auth }, query: { id: 'camp-b1' }, url: '/api/campaigns' } as any,
      r1.res
    );
    expect(r1.res.status).toHaveBeenCalledWith(404);

    const rMissing = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: auth }, query: { id: 'camp-does-not-exist' }, url: '/api/campaigns' } as any,
      rMissing.res
    );
    expect(rMissing.res.status).toHaveBeenCalledWith(404);
    expect(r1.getBody()).toEqual(rMissing.getBody());

    // List all GET /api/campaigns
    const r2 = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: auth }, query: {}, url: '/api/campaigns' } as any,
      r2.res
    );
    expect(r2.res.status).toHaveBeenCalledWith(200);
    const listIds = r2.getBody().campaigns.map((c: any) => c.id);
    expect(listIds).toEqual(expect.arrayContaining(['camp-a1', 'camp-a2']));
    expect(listIds).not.toContain('camp-b1');

    // Search GET /api/campaigns?search=Prompt
    const r3 = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: auth }, query: { search: 'Prompt' }, url: '/api/campaigns' } as any,
      r3.res
    );
    expect(r3.res.status).toHaveBeenCalledWith(200);
    const searchIds = r3.getBody().campaigns.map((c: any) => c.id);
    expect(searchIds).toContain('camp-a1');
    expect(searchIds).not.toContain('camp-b1');

    // Query by Org B userId GET /api/campaigns?userId=orgB-analyst
    const r4 = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: auth }, query: { userId: 'orgB-analyst' }, url: '/api/campaigns' } as any,
      r4.res
    );
    expect(r4.res.status).toHaveBeenCalledWith(200);
    expect(r4.getBody().campaigns).toEqual([]);
  });

  it('(2) Org A admin cannot update or delete Org B campaigns', async () => {
    const auth = authHeaderFor('orgA-admin');

    // PUT /api/campaigns targeting camp-b1 -> normalized 404
    const rPut = createMockRes();
    await campaignsHandler(
      {
        method: 'PUT',
        headers: { authorization: auth },
        query: {},
        body: { id: 'camp-b1', name: 'Hijacked' },
        url: '/api/campaigns',
      } as any,
      rPut.res
    );
    expect(rPut.res.status).toHaveBeenCalledWith(404);
    expect(mockCampaigns.get('camp-b1').name).toBe('Org B Secret Campaign');

    // DELETE /api/campaigns?id=camp-b1 -> normalized 404
    const rDel = createMockRes();
    await campaignsHandler(
      { method: 'DELETE', headers: { authorization: auth }, query: { id: 'camp-b1' }, url: '/api/campaigns' } as any,
      rDel.res
    );
    expect(rDel.res.status).toHaveBeenCalledWith(404);
    expect(mockCampaigns.has('camp-b1')).toBe(true);
  });

  it('(3) Org A red_team_lead cannot read Org B audit logs', async () => {
    const auth = authHeaderFor('orgA-lead');

    // List all audit logs
    const r1 = createMockRes();
    await auditLogsHandler(
      { method: 'GET', headers: { authorization: auth }, query: {}, url: '/api/audit-logs' } as any,
      r1.res
    );
    expect(r1.res.status).toHaveBeenCalledWith(200);
    const ids = r1.getBody().auditLogs.map((l: any) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['log-a1', 'log-a2']));
    expect(ids).not.toContain('log-b1');
    expect(r1.getBody().count).toBe(2);

    // Filter by Org B actorId
    const r2 = createMockRes();
    await auditLogsHandler(
      { method: 'GET', headers: { authorization: auth }, query: { actorId: 'orgB-analyst' }, url: '/api/audit-logs' } as any,
      r2.res
    );
    expect(r2.res.status).toHaveBeenCalledWith(200);
    expect(r2.getBody().auditLogs).toEqual([]);
    expect(r2.getBody().count).toBe(0);
  });

  it('(4) Missing or empty organizationId is denied with 403 across users, campaigns, and audit-logs', async () => {
    for (const userId of ['no-org-admin', 'ws-org-admin']) {
      const auth = authHeaderFor(userId);

      const rCamp = createMockRes();
      await campaignsHandler(
        { method: 'GET', headers: { authorization: auth }, query: {}, url: '/api/campaigns' } as any,
        rCamp.res
      );
      expect(rCamp.res.status).toHaveBeenCalledWith(403);

      const rAudit = createMockRes();
      await auditLogsHandler(
        { method: 'GET', headers: { authorization: auth }, query: {}, url: '/api/audit-logs' } as any,
        rAudit.res
      );
      expect(rAudit.res.status).toHaveBeenCalledWith(403);

      const rUsers = createMockRes();
      await usersHandler(
        { method: 'GET', headers: { authorization: auth }, query: { email: 'a1@orga.sec' }, url: '/api/users' } as any,
        rUsers.res
      );
      expect(rUsers.res.status).toHaveBeenCalledWith(403);
    }
  });

  it('(5) Same-org admin and red_team_lead access succeeds', async () => {
    const adminAuth = authHeaderFor('orgA-admin');
    const leadAuth = authHeaderFor('orgA-lead');

    // Org A admin reads Org A campaign by id
    const rGet = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: adminAuth }, query: { id: 'camp-a1' }, url: '/api/campaigns' } as any,
      rGet.res
    );
    expect(rGet.res.status).toHaveBeenCalledWith(200);
    expect(rGet.getBody().campaign.id).toBe('camp-a1');

    // Org A admin updates Org A campaign
    const rPut = createMockRes();
    await campaignsHandler(
      {
        method: 'PUT',
        headers: { authorization: adminAuth },
        query: {},
        body: { id: 'camp-a1', name: 'Updated Org A Campaign' },
        url: '/api/campaigns',
      } as any,
      rPut.res
    );
    expect(rPut.res.status).toHaveBeenCalledWith(200);
    expect(mockCampaigns.get('camp-a1').name).toBe('Updated Org A Campaign');

    // Org A admin deletes Org A campaign
    const rDel = createMockRes();
    await campaignsHandler(
      { method: 'DELETE', headers: { authorization: adminAuth }, query: { id: 'camp-a2' }, url: '/api/campaigns' } as any,
      rDel.res
    );
    expect(rDel.res.status).toHaveBeenCalledWith(200);
    expect(mockCampaigns.has('camp-a2')).toBe(false);

    // Org A red_team_lead reads Org A audit logs
    const rAudit = createMockRes();
    await auditLogsHandler(
      { method: 'GET', headers: { authorization: leadAuth }, query: {}, url: '/api/audit-logs' } as any,
      rAudit.res
    );
    expect(rAudit.res.status).toHaveBeenCalledWith(200);
    expect(rAudit.getBody().auditLogs.length).toBeGreaterThanOrEqual(2);
  });

  it('(6) Non-admin analyst remains scoped to own campaigns and audit logs', async () => {
    const analystAuth = authHeaderFor('orgA-analyst-1');

    // List campaigns: only camp-a1 (not camp-a2 or camp-b1)
    const rList = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: analystAuth }, query: {}, url: '/api/campaigns' } as any,
      rList.res
    );
    expect(rList.res.status).toHaveBeenCalledWith(200);
    expect(rList.getBody().campaigns.map((c: any) => c.id)).toEqual(['camp-a1']);

    // Direct GET ?id=camp-a2 (same org, different user) -> 403
    const rOtherGet = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: analystAuth }, query: { id: 'camp-a2' }, url: '/api/campaigns' } as any,
      rOtherGet.res
    );
    expect(rOtherGet.res.status).toHaveBeenCalledWith(403);

    // Audit logs: only own logs (log-a1)
    const rAudit = createMockRes();
    await auditLogsHandler(
      { method: 'GET', headers: { authorization: analystAuth }, query: {}, url: '/api/audit-logs' } as any,
      rAudit.res
    );
    expect(rAudit.res.status).toHaveBeenCalledWith(200);
    expect(rAudit.getBody().auditLogs.map((l: any) => l.id)).toEqual(['log-a1']);
    expect(rAudit.getBody().count).toBe(1);

    // Audit logs with ?actorId=orgA-analyst-2 -> 403
    const rOtherAudit = createMockRes();
    await auditLogsHandler(
      { method: 'GET', headers: { authorization: analystAuth }, query: { actorId: 'orgA-analyst-2' }, url: '/api/audit-logs' } as any,
      rOtherAudit.res
    );
    expect(rOtherAudit.res.status).toHaveBeenCalledWith(403);
  });

  it('(7) /api/users isolates two independent orgs across GET, POST, PUT, DELETE and normalizes existence', async () => {
    const orgAAdminAuth = authHeaderFor('orgA-admin');
    const orgBAdminAuth = authHeaderFor('orgB-admin');

    // GET ?id= cross-tenant returns 200 { user: null }, indistinguishable from non-existent
    const rCrossId = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: orgAAdminAuth }, query: { id: 'orgB-analyst' }, url: '/api/users' } as any,
      rCrossId.res
    );
    expect(rCrossId.res.status).toHaveBeenCalledWith(200);
    expect(rCrossId.getBody()).toEqual({ user: null });

    const rMissingId = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: orgAAdminAuth }, query: { id: 'nonexistent-user' }, url: '/api/users' } as any,
      rMissingId.res
    );
    expect(rMissingId.res.status).toHaveBeenCalledWith(200);
    expect(rMissingId.getBody()).toEqual(rCrossId.getBody());

    // GET ?email= cross-tenant returns 200 { user: null }, indistinguishable from non-existent
    const rCrossEmail = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: orgAAdminAuth }, query: { email: 'a1@orgb.sec' }, url: '/api/users' } as any,
      rCrossEmail.res
    );
    expect(rCrossEmail.res.status).toHaveBeenCalledWith(200);
    expect(rCrossEmail.getBody()).toEqual({ user: null });

    const rMissingEmail = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: orgAAdminAuth }, query: { email: 'nobody@orgb.sec' }, url: '/api/users' } as any,
      rMissingEmail.res
    );
    expect(rMissingEmail.res.status).toHaveBeenCalledWith(200);
    expect(rMissingEmail.getBody()).toEqual(rCrossEmail.getBody());

    // GET ?orgId= cross-tenant -> 403; same-org -> 200 with only org-a users
    const rCrossOrg = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: orgAAdminAuth }, query: { orgId: 'org-b' }, url: '/api/users' } as any,
      rCrossOrg.res
    );
    expect(rCrossOrg.res.status).toHaveBeenCalledWith(403);

    const rSameOrg = createMockRes();
    await usersHandler(
      { method: 'GET', headers: { authorization: orgAAdminAuth }, query: { orgId: 'org-a' }, url: '/api/users' } as any,
      rSameOrg.res
    );
    expect(rSameOrg.res.status).toHaveBeenCalledWith(200);
    expect(rSameOrg.getBody().users.every((u: any) => u.orgId === 'org-a')).toBe(true);

    // Direct POST /api/users is deprecated (410 Gone) for both cross-org and same-org admins, without creating auth0Sub: null rows
    const deprecatedBody = {
      error: 'Gone',
      code: 'DIRECT_USER_CREATION_DEPRECATED',
      message: 'Direct user creation is deprecated. Use POST /api/users?resource=invitations to invite users.',
    };
    const userCountBeforePost = mockUsers.size;

    const rPostCross = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: orgAAdminAuth },
        body: { email: 'intruder@orgb.sec', role: 'admin', orgId: 'org-b' },
        url: '/api/users',
      } as any,
      rPostCross.res
    );
    expect(rPostCross.res.status).toHaveBeenCalledWith(410);
    expect(rPostCross.getBody()).toEqual(deprecatedBody);

    const rPostSame = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: orgBAdminAuth },
        body: { email: 'newuser@orgb.sec', name: 'Org B New', role: 'analyst', orgId: 'org-b' },
        url: '/api/users',
      } as any,
      rPostSame.res
    );
    expect(rPostSame.res.status).toHaveBeenCalledWith(410);
    expect(rPostSame.getBody()).toEqual(deprecatedBody);
    expect(mockUsers.size).toBe(userCountBeforePost);

    // Non-admin still gets 403 on POST /api/users
    const rPostNonAdmin = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: authHeaderFor('orgB-analyst') },
        body: { email: 'another@orgb.sec', role: 'analyst', orgId: 'org-b' },
        url: '/api/users',
      } as any,
      rPostNonAdmin.res
    );
    expect(rPostNonAdmin.res.status).toHaveBeenCalledWith(403);

    // Seed a target user in org-b for PUT and DELETE isolation checks
    const createdOrgBUserId = 'orgB-target';
    mockUsers.set(createdOrgBUserId, {
      id: createdOrgBUserId,
      email: 'target@orgb.sec',
      auth0Sub: 'auth0|orgb-target',
      name: 'Org B Target',
      role: 'analyst',
      orgId: 'org-b',
      disabledAt: null,
    });

    // PUT cross-tenant -> 404 (normalized) and target unchanged; same-org -> 200
    const rPutCross = createMockRes();
    await usersHandler(
      {
        method: 'PUT',
        headers: { authorization: orgAAdminAuth },
        body: { id: createdOrgBUserId, role: 'admin', name: 'Hijacked' },
        url: '/api/users',
      } as any,
      rPutCross.res
    );
    expect(rPutCross.res.status).toHaveBeenCalledWith(404);
    expect(mockUsers.get(createdOrgBUserId).role).toBe('analyst');

    const rPutSame = createMockRes();
    await usersHandler(
      {
        method: 'PUT',
        headers: { authorization: orgBAdminAuth },
        body: { id: createdOrgBUserId, role: 'red_team_lead', name: 'Org B Lead' },
        url: '/api/users',
      } as any,
      rPutSame.res
    );
    expect(rPutSame.res.status).toHaveBeenCalledWith(200);
    expect(mockUsers.get(createdOrgBUserId).role).toBe('red_team_lead');

    // DELETE cross-tenant -> 404 (normalized) and target preserved; same-org -> 200
    const rDelCross = createMockRes();
    await usersHandler(
      { method: 'DELETE', headers: { authorization: orgAAdminAuth }, query: { id: createdOrgBUserId }, url: '/api/users' } as any,
      rDelCross.res
    );
    expect(rDelCross.res.status).toHaveBeenCalledWith(404);
    expect(mockUsers.has(createdOrgBUserId)).toBe(true);

    const rDelSame = createMockRes();
    await usersHandler(
      { method: 'DELETE', headers: { authorization: orgBAdminAuth }, query: { id: createdOrgBUserId }, url: '/api/users' } as any,
      rDelSame.res
    );
    expect(rDelSame.res.status).toHaveBeenCalledWith(200);
    expect(rDelSame.getBody()).toEqual({ success: true, deactivated: true });
    expect(mockUsers.get(createdOrgBUserId)?.disabledAt).toBeInstanceOf(Date);
  });

  it('(8) Array query params return 400 and campaign creator omits sensitive fields like auth0Sub', async () => {
    const auth = authHeaderFor('orgA-admin');

    for (const query of [{ id: ['a', 'b'] }, { email: ['a@b.com', 'c@d.com'] }, { orgId: ['org-a', 'org-b'] }]) {
      const rUserArr = createMockRes();
      await usersHandler(
        { method: 'GET', headers: { authorization: auth }, query, url: '/api/users' } as any,
        rUserArr.res
      );
      expect(rUserArr.res.status).toHaveBeenCalledWith(400);
    }

    for (const query of [{ id: ['a', 'b'] }, { userId: ['u1', 'u2'] }, { search: ['x', 'y'] }]) {
      const rCampArr = createMockRes();
      await campaignsHandler(
        { method: 'GET', headers: { authorization: auth }, query, url: '/api/campaigns' } as any,
        rCampArr.res
      );
      expect(rCampArr.res.status).toHaveBeenCalledWith(400);
    }

    const rCamp = createMockRes();
    await campaignsHandler(
      { method: 'GET', headers: { authorization: auth }, query: { id: 'camp-a1' }, url: '/api/campaigns' } as any,
      rCamp.res
    );
    expect(rCamp.res.status).toHaveBeenCalledWith(200);
    expect(rCamp.getBody().campaign.creator).toBeDefined();
    expect(rCamp.getBody().campaign.creator.orgId).toBe('org-a');
    expect(rCamp.getBody().campaign.creator.auth0Sub).toBeUndefined();
  });

  it('(9) resolveAuth0User fails closed without explicit orgId and preserves findOrCreateLocalDevUser', async () => {
    for (const badOrg of [undefined, '', '   ', 'default_org']) {
      await expect(
        UserRepository.resolveAuth0User({
          sub: `auth0|new-${String(badOrg)}`,
          email: `new-${Math.random()}@example.com`,
          emailVerified: true,
          name: 'Test User',
          orgId: badOrg,
        })
      ).rejects.toThrow();
    }

    const provisioned = await UserRepository.resolveAuth0User({
      sub: 'auth0|valid-org-user',
      email: 'valid@orgc.sec',
      emailVerified: true,
      name: 'Valid Org User',
      orgId: 'org-c',
    });
    expect(provisioned.orgId).toBe('org-c');
    expect(provisioned.role).toBe('analyst');

    const localDev = await UserRepository.findOrCreateLocalDevUser();
    expect(localDev.orgId).toBe('local_dev_org');
    expect(localDev.role).toBe('analyst');
  });

  it('(10) /api/users returns 404 on PUT for deactivated user, 409 on sole-admin demotion, and 410 Gone on POST without enumerating emails', async () => {
    const orgAAdminAuth = authHeaderFor('orgA-admin');

    // PUT on deactivated user -> 404
    mockUsers.set('orgA-deactivated', {
      id: 'orgA-deactivated',
      email: 'deactivated@orga.sec',
      role: 'analyst',
      orgId: 'org-a',
      disabledAt: new Date(),
    });
    const rPutDeactivated = createMockRes();
    await usersHandler(
      {
        method: 'PUT',
        headers: { authorization: orgAAdminAuth },
        body: { id: 'orgA-deactivated', name: 'Should Fail', role: 'red_team_lead' },
        url: '/api/users',
      } as any,
      rPutDeactivated.res
    );
    expect(rPutDeactivated.res.status).toHaveBeenCalledWith(404);
    expect(mockUsers.get('orgA-deactivated').role).toBe('analyst');

    // PUT sole-admin demotion -> 409
    const rDemoteSoleAdmin = createMockRes();
    await usersHandler(
      {
        method: 'PUT',
        headers: { authorization: orgAAdminAuth },
        body: { id: 'orgA-admin', role: 'analyst' },
        url: '/api/users',
      } as any,
      rDemoteSoleAdmin.res
    );
    expect(rDemoteSoleAdmin.res.status).toHaveBeenCalledWith(409);
    expect(rDemoteSoleAdmin.getBody()).toEqual({
      error: 'Conflict',
      message: 'Cannot demote the last active administrator in the organization',
    });
    expect(mockUsers.get('orgA-admin').role).toBe('admin');

    // POST with existing or deactivated email -> 410 Gone without enumerating or calling user.create
    const createCallsBefore = mockPrisma.user.create.mock.calls.length;
    const rPostExisting = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: orgAAdminAuth },
        body: { email: 'a1@orga.sec', name: 'Dup User', role: 'analyst', orgId: 'org-a' },
        url: '/api/users',
      } as any,
      rPostExisting.res
    );
    expect(rPostExisting.res.status).toHaveBeenCalledWith(410);

    const rPostDeactivated = createMockRes();
    await usersHandler(
      {
        method: 'POST',
        headers: { authorization: orgAAdminAuth },
        body: { email: 'deactivated@orga.sec', name: 'Deactivated User', role: 'analyst', orgId: 'org-a' },
        url: '/api/users',
      } as any,
      rPostDeactivated.res
    );
    expect(rPostDeactivated.res.status).toHaveBeenCalledWith(410);
    expect(rPostDeactivated.getBody()).toEqual({
      error: 'Gone',
      code: 'DIRECT_USER_CREATION_DEPRECATED',
      message: 'Direct user creation is deprecated. Use POST /api/users?resource=invitations to invite users.',
    });
    expect(rPostExisting.getBody()).toEqual(rPostDeactivated.getBody());
    expect(mockPrisma.user.create.mock.calls.length).toBe(createCallsBefore);
  });
});
