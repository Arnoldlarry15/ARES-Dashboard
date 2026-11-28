// Campaign Management - Database-backed with localStorage fallback

import { ApiError, CampaignAPI } from './apiClient';
import { AuthService } from '../services/authService';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  tactic_id: string;
  tactic_name: string;
  framework: string;
  selected_vectors: string[];
  selected_payload_indices: number[];
  created_at: string;
  updated_at: string;
  createdBy?: string;
  creator?: {
    id: string;
    email: string;
    name?: string;
  };
}

// Database campaign format (camelCase)
interface DBCampaign {
  id: string;
  name: string;
  description?: string;
  tacticId: string;
  tacticName: string;
  framework: string;
  selectedVectors: string[];
  selectedPayloadIndices: number[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  creator?: {
    id: string;
    email: string;
    name?: string;
  };
}

const CAMPAIGNS_KEY = 'ares_campaigns';

/**
 * Explicit error thrown when campaign operations fail due to authentication (401)
 * or authorization (403) failures. Never masked by localStorage fallback.
 */
export class CampaignAuthError extends ApiError {
  readonly code: 'AUTHENTICATION_REQUIRED' | 'AUTHORIZATION_DENIED' | (string & {});

  constructor(
    message: string,
    status: 401 | 403,
    data?: unknown
  ) {
    super(message, status, data);
    this.name = 'CampaignAuthError';
    const dataCode =
      data &&
      typeof data === 'object' &&
      'code' in data &&
      typeof (data as { code?: unknown }).code === 'string'
        ? (data as { code: string }).code
        : undefined;
    this.code =
      dataCode || (status === 401 ? 'AUTHENTICATION_REQUIRED' : 'AUTHORIZATION_DENIED');
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (error instanceof ApiError) {
    return error.status;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
}

function rethrowIfAuthError(error: unknown): void {
  if (error instanceof CampaignAuthError) {
    throw error;
  }
  const status = getErrorStatus(error);
  if (status === 401) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Authentication required to access campaigns';
    const data = error instanceof ApiError ? error.data : undefined;
    throw new CampaignAuthError(message, 401, data);
  }
  if (status === 403) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Authorization denied for campaign operation';
    const data = error instanceof ApiError ? error.data : undefined;
    throw new CampaignAuthError(message, 403, data);
  }
}

function classifyAvailabilityError(error: unknown): 'network' | 'database' | null {
  const status = getErrorStatus(error);
  if (status === 503) {
    return 'database';
  }
  if (
    status === 0 ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return 'network';
  }
  return null;
}

function readLocalCampaigns(): Campaign[] {
  const stored = localStorage.getItem(CAMPAIGNS_KEY);
  if (!stored) return [];
  return JSON.parse(stored) as Campaign[];
}

function writeLocalCampaigns(campaigns: Campaign[]): void {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
}

function saveLocalCampaign(
  campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>
): Campaign {
  const campaigns = readLocalCampaigns();
  const newCampaign: Campaign = {
    ...campaign,
    id: `campaign_${Date.now()}_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  campaigns.push(newCampaign);
  writeLocalCampaigns(campaigns);
  return newCampaign;
}

function updateLocalCampaign(
  id: string,
  updates: Partial<Omit<Campaign, 'id' | 'created_at'>>
): Campaign | null {
  const campaigns = readLocalCampaigns();
  const index = campaigns.findIndex(c => c.id === id);

  if (index === -1) return null;

  campaigns[index] = {
    ...campaigns[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };

  writeLocalCampaigns(campaigns);
  return campaigns[index];
}

function deleteLocalCampaign(id: string): boolean {
  const campaigns = readLocalCampaigns();
  const filtered = campaigns.filter(c => c.id !== id);

  if (filtered.length === campaigns.length) return false;

  writeLocalCampaigns(filtered);
  return true;
}

// Convert DB format to app format
function dbToApp(dbCampaign: DBCampaign): Campaign {
  return {
    id: dbCampaign.id,
    name: dbCampaign.name,
    description: dbCampaign.description,
    tactic_id: dbCampaign.tacticId,
    tactic_name: dbCampaign.tacticName,
    framework: dbCampaign.framework,
    selected_vectors: dbCampaign.selectedVectors || [],
    selected_payload_indices: dbCampaign.selectedPayloadIndices || [],
    created_at: dbCampaign.createdAt,
    updated_at: dbCampaign.updatedAt,
    createdBy: dbCampaign.createdBy,
    creator: dbCampaign.creator,
  };
}

// Convert app format to DB format
function appToDb(campaign: Partial<Campaign>, createdBy: string): Partial<DBCampaign> {
  const dbCampaign: Partial<DBCampaign> = {};
  
  if (campaign.name) dbCampaign.name = campaign.name;
  if (campaign.description !== undefined) dbCampaign.description = campaign.description;
  if (campaign.tactic_id) dbCampaign.tacticId = campaign.tactic_id;
  if (campaign.tactic_name) dbCampaign.tacticName = campaign.tactic_name;
  if (campaign.framework) dbCampaign.framework = campaign.framework;
  if (campaign.selected_vectors) dbCampaign.selectedVectors = campaign.selected_vectors;
  if (campaign.selected_payload_indices) dbCampaign.selectedPayloadIndices = campaign.selected_payload_indices;
  
  dbCampaign.createdBy = createdBy;
  
  return dbCampaign;
}

export const CampaignManager = {
  // Get current user ID
  _getCurrentUserId(): string {
    const user = AuthService.getCurrentUser();
    return user?.id || 'anonymous';
  },

  // Check if database is available
  async _isDatabaseAvailable(): Promise<boolean> {
    try {
      await CampaignAPI.getAll();
      return true;
    } catch (err) {
      rethrowIfAuthError(err);
      const availabilityIssue = classifyAvailabilityError(err);
      if (availabilityIssue === 'network') {
        console.warn('Campaign API network unavailable, falling back to localStorage:', err);
        return false;
      }
      if (availabilityIssue === 'database') {
        console.warn('Campaign database unavailable (503), falling back to localStorage:', err);
        return false;
      }
      console.error('Database check failed with unexpected error:', err);
      throw err;
    }
  },

  // Get all saved campaigns
  async getAllCampaigns(): Promise<Campaign[]> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();

      if (dbAvailable) {
        const userId = this._getCurrentUserId();
        const dbCampaigns = await CampaignAPI.findByUserId(userId) as unknown as DBCampaign[];
        return dbCampaigns.map(dbToApp);
      } else {
        return readLocalCampaigns();
      }
    } catch (error) {
      rethrowIfAuthError(error);
      if (classifyAvailabilityError(error) !== null) {
        return readLocalCampaigns();
      }
      console.error('Failed to load campaigns:', error);
      throw error;
    }
  },

  // Save a new campaign
  async saveCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();
      const userId = this._getCurrentUserId();

      if (dbAvailable) {
        const dbInput = {
          name: campaign.name,
          description: campaign.description,
          framework: campaign.framework,
          tacticId: campaign.tactic_id,
          tacticName: campaign.tactic_name,
          createdBy: userId,
          selectedVectors: campaign.selected_vectors,
          selectedPayloadIndices: campaign.selected_payload_indices,
        };

        const dbCampaign = await CampaignAPI.create(dbInput) as unknown as DBCampaign;
        return dbToApp(dbCampaign);
      } else {
        return saveLocalCampaign(campaign);
      }
    } catch (error) {
      rethrowIfAuthError(error);
      if (classifyAvailabilityError(error) !== null) {
        return saveLocalCampaign(campaign);
      }
      console.error('Failed to save campaign:', error);
      throw error;
    }
  },

  // Update an existing campaign
  async updateCampaign(id: string, updates: Partial<Omit<Campaign, 'id' | 'created_at'>>): Promise<Campaign | null> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();

      if (dbAvailable) {
        const userId = this._getCurrentUserId();
        const dbUpdates = appToDb(updates, userId);
        const dbCampaign = await CampaignAPI.update(id, dbUpdates as Record<string, unknown>) as unknown as DBCampaign;
        return dbToApp(dbCampaign);
      } else {
        return updateLocalCampaign(id, updates);
      }
    } catch (error) {
      rethrowIfAuthError(error);
      if (classifyAvailabilityError(error) !== null) {
        return updateLocalCampaign(id, updates);
      }
      console.error('Failed to update campaign:', error);
      throw error;
    }
  },

  // Delete a campaign
  async deleteCampaign(id: string): Promise<boolean> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();
      const userId = this._getCurrentUserId();

      if (dbAvailable) {
        await CampaignAPI.delete(id, userId);
        return true;
      } else {
        return deleteLocalCampaign(id);
      }
    } catch (error) {
      rethrowIfAuthError(error);
      if (classifyAvailabilityError(error) !== null) {
        return deleteLocalCampaign(id);
      }
      console.error('Failed to delete campaign:', error);
      throw error;
    }
  },

  // Get a specific campaign by ID
  async getCampaign(id: string): Promise<Campaign | null> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();

      if (dbAvailable) {
        const dbCampaign = await CampaignAPI.findById(id) as unknown as DBCampaign | null;
        return dbCampaign ? dbToApp(dbCampaign) : null;
      } else {
        return readLocalCampaigns().find(c => c.id === id) || null;
      }
    } catch (error) {
      rethrowIfAuthError(error);
      if (classifyAvailabilityError(error) !== null) {
        return readLocalCampaigns().find(c => c.id === id) || null;
      }
      if (getErrorStatus(error) === 404) {
        return null;
      }
      console.error('Failed to get campaign:', error);
      throw error;
    }
  },

  // Export campaigns as JSON
  async exportCampaigns(): Promise<string> {
    const campaigns = await this.getAllCampaigns();
    return JSON.stringify(campaigns, null, 2);
  },

  // Import campaigns from JSON
  async importCampaigns(jsonData: string): Promise<number> {
    try {
      const imported = JSON.parse(jsonData) as Campaign[];
      const existing = await this.getAllCampaigns();

      // Merge, avoiding duplicates by ID
      const existingIds = new Set(existing.map(c => c.id));
      const newCampaigns = imported.filter(c => !existingIds.has(c.id));

      const dbAvailable = await this._isDatabaseAvailable();

      if (dbAvailable) {
        // Import to database
        for (const campaign of newCampaigns) {
          await this.saveCampaign(campaign);
        }
      } else {
        // Fallback to localStorage
        const merged = [...existing, ...newCampaigns];
        writeLocalCampaigns(merged);
      }

      return newCampaigns.length;
    } catch (error) {
      rethrowIfAuthError(error);
      console.error('Failed to import campaigns:', error);
      throw error;
    }
  },
};
