// API Client for database-backed operations
// Replaces localStorage with persistent backend API calls

import type { Campaign } from './campaigns';

// API base URL - works for both local dev and production
const API_BASE = typeof window !== 'undefined' ? '/api' : '';

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
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error || 'API request failed',
        response.status,
        data
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

  async create(data: CreateUserInput): Promise<User> {
    const { user } = await fetchApi<{ user: User }>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return user;
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
