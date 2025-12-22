// Team Workspace and Collaboration Types

import { UserRole } from './auth';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  settings: {
    allow_campaign_sharing: boolean;
    default_member_role: UserRole;
    max_members?: number;
  };
}

export interface WorkspaceMember {
  user_id: string;
  email: string;
  name: string;
  role: UserRole;
  joined_at: string;
  invited_by: string;
  status: 'active' | 'invited' | 'suspended';
}

export interface CampaignShare {
  campaign_id: string;
  shared_with: string[]; // user IDs
  permissions: {
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
    can_reshare: boolean;
  };
  shared_by: string; // user ID
  shared_at: string;
}

export interface TeamActivity {
  id: string;
  user_id: string;
  user_name: string;
  action: 'campaign_created' | 'campaign_shared' | 'campaign_edited' | 'member_joined' | 'member_left';
  resource_id?: string;
  resource_name?: string;
  timestamp: string;
  details?: Record<string, any>;
}
