// API Client for database-backed operations
// Replaces localStorage with persistent backend API calls

import type { Campaign } from './campaigns';

// API base URL - works for both local dev and production
const API_BASE = typeof window !== 'undefined' ? '/api' : '';

type AuthTokenProvider = () => Promise<string | null>;
let authTokenProvider: AuthTokenProvider | null = null;

export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  authTokenProvider = provider;
}

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null;
  const match =
    document.cookie.match(/(?:^|;\s*)__Host-csrf_token=([^;]+)/) ||
    document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

export async function buildAuthHeaders(method = 'GET'): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (authTokenProvider) {
    try {
      const token = await authTokenProvider();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Leave Authorization unset so cookie-based session can still be evaluated
    }
  }
  const upperMethod = method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
    const csrf = getCsrfTokenFromCookie();
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
  }
  return headers;
}

// Generic API error class
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Generic fetch wrapper with error handling
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const authHeaders = await buildAuthHeaders(options.method || 'GET');
  
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers,
      },
    });

    if (response.ok && response.status === 204) {
      return undefined as T;
    }

    let data: unknown = null;
    let parseError: unknown = null;
    try {
      data = await response.json();
    } catch (err) {
      parseError = err;
      data = null;
    }

    if (!response.ok) {
      const errorPayload =
        data && typeof data === 'object'
          ? (data as { error?: unknown; message?: unknown })
          : null;
      const errorMessage =
        (typeof errorPayload?.error === 'string' && errorPayload.error) ||
        (typeof errorPayload?.message === 'string' && errorPayload.message) ||
        response.statusText ||
        'API request failed';

      throw new ApiError(
        errorMessage,
        response.status,
        data
      );
    }

    if (parseError !== null) {
      throw new ApiError(
        'Invalid JSON response from server',
        typeof response.status === 'number' ? response.status : 200,
        parseError
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      'Network error or server unavailable',
      0,
      error
    );
  }
}

// User API types
export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  role: string;
  orgId: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: string;
  lastLogin?: Date;
}

export interface OrganizationInvitation {
  id: string;
  orgId: string;
  invitedEmail?: string | null;
  role: string;
  createdBy: string;
  expiresAt: string;
  usedAt?: string | null;
  usedBy?: string | null;
  createdAt: string;
}

export interface CreateInvitationInput {
  invitedEmail?: string;
  role: string;
  expiresInHours?: number;
}

export interface CreateInvitationResponse {
  invitation: OrganizationInvitation;
  token: string;
}

// Campaign API types
export interface CreateCampaignInput {
  name: string;
  description?: string;
  framework: string;
  tacticId: string;
  tacticName: string;
  createdBy: string;
  selectedVectors?: string[];
  selectedPayloadIndices?: number[];
  metadata?: Record<string, unknown>;
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  framework?: string;
  tacticId?: string;
  tacticName?: string;
  selectedVectors?: string[];
  selectedPayloadIndices?: number[];
  metadata?: Record<string, unknown>;
}

// Audit Log API types
export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  actor?: User;
}

export interface CreateAuditLogInput {
  actorId: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// User API
export const UserAPI = {
  async findByEmail(email: string): Promise<User | null> {
    const { user } = await fetchApi<{ user: User | null }>(
      `/users?email=${encodeURIComponent(email)}`
    );
    return user;
  },

  async findById(id: string): Promise<User | null> {
    const { user } = await fetchApi<{ user: User | null }>(
      `/users?id=${encodeURIComponent(id)}`
    );
    return user;
  },

  async findByOrgId(orgId: string): Promise<User[]> {
    const { users } = await fetchApi<{ users: User[] }>(
      `/users?orgId=${encodeURIComponent(orgId)}`
    );
    return users;
  },

  async update(id: string, data: UpdateUserInput): Promise<User> {
    const { user } = await fetchApi<{ user: User }>('/users', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
    return user;
  },

  async delete(id: string): Promise<void> {
    await fetchApi<{ message: string }>(`/users?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async listInvitations(): Promise<OrganizationInvitation[]> {
    const { invitations } = await fetchApi<{ invitations: OrganizationInvitation[] }>(
      '/users?resource=invitations'
    );
    return invitations;
  },

  async createInvitation(data: CreateInvitationInput): Promise<CreateInvitationResponse> {
    return await fetchApi<CreateInvitationResponse>('/users?resource=invitations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revokeInvitation(id: string): Promise<void> {
    await fetchApi<{ success: boolean }>(
      `/users?resource=invitations&id=${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    );
  },
};

// Campaign API
export const CampaignAPI = {
  async getAll(): Promise<Campaign[]> {
    const { campaigns } = await fetchApi<{ campaigns: Campaign[] }>('/campaigns');
    return campaigns;
  },

  async findByUserId(userId: string): Promise<Campaign[]> {
    const { campaigns } = await fetchApi<{ campaigns: Campaign[] }>(
      `/campaigns?userId=${encodeURIComponent(userId)}`
    );
    return campaigns;
  },

  async findById(id: string): Promise<Campaign | null> {
    const { campaign } = await fetchApi<{ campaign: Campaign | null }>(
      `/campaigns?id=${encodeURIComponent(id)}`
    );
    return campaign;
  },

  async search(query: string, userId?: string): Promise<Campaign[]> {
    const params = new URLSearchParams({ search: query });
    if (userId) params.append('userId', userId);
    
    const { campaigns } = await fetchApi<{ campaigns: Campaign[] }>(
      `/campaigns?${params.toString()}`
    );
    return campaigns;
  },

  async create(data: CreateCampaignInput): Promise<Campaign> {
    const { campaign } = await fetchApi<{ campaign: Campaign }>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return campaign;
  },

  async update(id: string, data: UpdateCampaignInput): Promise<Campaign> {
    const { campaign } = await fetchApi<{ campaign: Campaign }>('/campaigns', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
    return campaign;
  },

  async delete(id: string, userId: string): Promise<void> {
    await fetchApi<{ message: string }>(
      `/campaigns?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  },
};

// Audit Log API
export const AuditLogAPI = {
  async getAll(
    filters?: {
      actorId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    },
    pagination?: {
      skip?: number;
      take?: number;
    }
  ): Promise<{ auditLogs: AuditLog[]; count: number }> {
    const params = new URLSearchParams();
    if (filters?.actorId) params.append('actorId', filters.actorId);
    if (filters?.action) params.append('action', filters.action);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (pagination?.skip !== undefined) params.append('skip', pagination.skip.toString());
    if (pagination?.take !== undefined) params.append('take', pagination.take.toString());

    return await fetchApi<{ auditLogs: AuditLog[]; count: number }>(
      `/audit-logs?${params.toString()}`
    );
  },

  async create(data: CreateAuditLogInput): Promise<AuditLog> {
    const { auditLog } = await fetchApi<{ auditLog: AuditLog }>('/audit-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return auditLog;
  },
};

// Helper to check if database is available
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await fetchApi('/users?orgId=test');
    return true;
  } catch (err) {
    console.warn('Database not available, falling back to localStorage', err);
    return false;
  }
}

export interface GenerationJobSummary {
  id: string;
  status: string;
  requestedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  remainingCount: number;
  retryCount?: number;
  maxRetries?: number;
  selectedFramework?: string;
  frameworkVersion?: string;
  selectedTacticId?: string;
  selectedTacticName?: string;
  failureMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
  deliveredPrompts?: Array<{
    vaultId: string;
    registryPromptId: string;
    framework: string;
    frameworkVersion: string;
    attackVector: string;
    attackName: string;
    payload: unknown;
    acquiredAt: string;
  }>;
}

export interface UserCreditsSummary {
  availableTokens: number;
  reservedTokens: number;
  updatedAt: string | null;
}

export interface VaultPromptItem {
  vaultId: string;
  jobId: string;
  registryPromptId: string;
  isDuplicateReported: boolean;
  replacedByVaultId: string | null;
  acquiredAt: string;
  framework: string;
  frameworkVersion: string;
  attackVector: string;
  attackName: string;
  payload: {
    description?: string;
    payload?: string;
    format?: string;
    attack_family?: string;
    technique?: string;
    expected_outcome?: string;
  };
}

export const GenerationJobsAPI = {
  async getCredits(): Promise<UserCreditsSummary> {
    const { credits } = await fetchApi<{ credits: UserCreditsSummary }>('/generation-jobs?action=credits');
    return credits;
  },

  async list(): Promise<GenerationJobSummary[]> {
    const { jobs } = await fetchApi<{ jobs: GenerationJobSummary[] }>('/generation-jobs');
    return jobs;
  },

  async create(data: {
    requestedCount: 4 | 12 | 28 | 40;
    selectedFramework: string;
    frameworkVersion?: string;
    selectedTacticId: string;
    selectedTacticName: string;
    selectedVectors: string[];
    selectedAttacks: string[];
    objectives?: string;
    idempotencyKey?: string;
  }): Promise<GenerationJobSummary> {
    const { job } = await fetchApi<{ job: GenerationJobSummary }>('/generation-jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return job;
  },

  async getStatus(jobId: string): Promise<GenerationJobSummary> {
    const { job } = await fetchApi<{ job: GenerationJobSummary }>(`/generation-jobs?id=${encodeURIComponent(jobId)}`);
    return job;
  },

  async cancel(jobId: string): Promise<{ success: boolean; status: string }> {
    return await fetchApi(`/generation-jobs?id=${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  },
};

export const PromptVaultAPI = {
  async list() {
    return await fetchApi<{ prompts: VaultPromptItem[] }>('/prompt-vault');
  },

  async reportDuplicate(vaultItemId: string, reason: string) {
    return await fetchApi<{ confirmed: boolean; reportId: string; replacementJobId: string | null }>(
      `/prompt-vault?id=${encodeURIComponent(vaultItemId)}&action=report-duplicate`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
  },
};
