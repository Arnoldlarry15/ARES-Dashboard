// Workspace and Collaboration Service

import { Organization, WorkspaceMember, CampaignShare, TeamActivity } from '../types/workspace';
import { AuthService } from './authService';
import { EmailService } from './emailService';
import { UserRole } from '../types/auth';

const WORKSPACE_KEY = 'ares_workspace';
const WORKSPACE_MEMBERS_KEY = 'ares_workspace_members';
const CAMPAIGN_SHARES_KEY = 'ares_campaign_shares';
const TEAM_ACTIVITY_KEY = 'ares_team_activity';

export class WorkspaceService {
  // Create or get workspace
  static getOrCreateWorkspace(): Organization {
    try {
      const stored = localStorage.getItem(WORKSPACE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }

      // Create default workspace
      const workspace: Organization = {
        id: 'workspace_' + Date.now(),
        name: 'ARES Red Team',
        slug: 'ares-red-team',
        owner_id: AuthService.getCurrentUser()?.id || 'demo_owner',
        created_at: new Date().toISOString(),
        settings: {
          allow_campaign_sharing: true,
          default_member_role: UserRole.ANALYST,
          max_members: 50
        }
      };

      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
      return workspace;
    } catch (error) {
      console.error('Failed to get/create workspace:', error);
      throw error;
    }
  }

  // Get all workspace members
  static getMembers(): WorkspaceMember[] {
    try {
      const stored = localStorage.getItem(WORKSPACE_MEMBERS_KEY);
      if (!stored) {
        // Initialize with current user
        const currentUser = AuthService.getCurrentUser();
        if (currentUser) {
          const initialMember: WorkspaceMember = {
            user_id: currentUser.id,
            email: currentUser.email,
            name: currentUser.name,
            role: currentUser.role,
            joined_at: new Date().toISOString(),
            invited_by: 'self',
            status: 'active'
          };
          const members = [initialMember];
          localStorage.setItem(WORKSPACE_MEMBERS_KEY, JSON.stringify(members));
          return members;
        }
        return [];
      }
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to get members:', error);
      return [];
    }
  }

  // Add member to workspace (invite)
  static async inviteMember(email: string, role: UserRole): Promise<WorkspaceMember> {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const members = this.getMembers();
    
    // Check if already exists
    if (members.some(m => m.email === email)) {
      throw new Error('Member already exists');
    }

    const newMember: WorkspaceMember = {
      user_id: 'invited_' + Date.now(),
      email,
      name: email.split('@')[0], // Use email prefix as name
      role,
      joined_at: new Date().toISOString(),
      invited_by: currentUser.id,
      status: 'invited'
    };

    members.push(newMember);
    localStorage.setItem(WORKSPACE_MEMBERS_KEY, JSON.stringify(members));

    // Send invite email
    try {
      const emailSent = await EmailService.sendInvite({
        to: email,
        role,
        invitedBy: currentUser.name,
        inviteLink: window.location.origin + '/accept-invite'
      });
      
      if (!emailSent) {
        console.warn('Failed to send invite email to', email);
      }
    } catch (err) {
      console.error('Error sending invite email:', err);
      // Don't throw - member is still added even if email fails
    }

    // Log activity
    this.logActivity({
      user_id: currentUser.id,
      user_name: currentUser.name,
      action: 'member_joined',
      resource_name: email,
      details: { role }
    });

    // Audit log
    AuthService.logAuditEvent({
      user_id: currentUser.id,
      user_email: currentUser.email,
      action: 'invite',
      resource_type: 'user',
      resource_id: newMember.user_id,
      details: { email, role }
    });

    return newMember;
  }

  // Remove member from workspace
  static removeMember(userId: string): boolean {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) return false;

    const members = this.getMembers();
    const filtered = members.filter(m => m.user_id !== userId);
    
    if (filtered.length === members.length) return false;

    localStorage.setItem(WORKSPACE_MEMBERS_KEY, JSON.stringify(filtered));

    // Log activity
    const removedMember = members.find(m => m.user_id === userId);
    if (removedMember) {
      this.logActivity({
        user_id: currentUser.id,
        user_name: currentUser.name,
        action: 'member_left',
        resource_name: removedMember.name
      });
    }

    return true;
  }

  // Share campaign with users
  static shareCampaign(
    campaignId: string,
    campaignName: string,
    userIds: string[],
    permissions: CampaignShare['permissions']
  ): CampaignShare {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const shares = this.getCampaignShares();
    
    const share: CampaignShare = {
      campaign_id: campaignId,
      shared_with: userIds,
      permissions,
      shared_by: currentUser.id,
      shared_at: new Date().toISOString()
    };

    // Remove existing share for this campaign if any
    const filtered = shares.filter(s => s.campaign_id !== campaignId);
    filtered.push(share);
    
    localStorage.setItem(CAMPAIGN_SHARES_KEY, JSON.stringify(filtered));

    // Log activity
    this.logActivity({
      user_id: currentUser.id,
      user_name: currentUser.name,
      action: 'campaign_shared',
      resource_id: campaignId,
      resource_name: campaignName,
      details: { shared_with_count: userIds.length }
    });

    // Audit log
    AuthService.logAuditEvent({
      user_id: currentUser.id,
      user_email: currentUser.email,
      action: 'share',
      resource_type: 'campaign',
      resource_id: campaignId,
      details: { shared_with: userIds, permissions }
    });

    return share;
  }

  // Get campaign shares
  static getCampaignShares(): CampaignShare[] {
    try {
      const stored = localStorage.getItem(CAMPAIGN_SHARES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to get campaign shares:', error);
      return [];
    }
  }

  // Check if user has access to campaign
  static canAccessCampaign(campaignId: string, userId: string): boolean {
    const shares = this.getCampaignShares();
    const share = shares.find(s => s.campaign_id === campaignId);
    
    if (!share) return true; // No share means public/owner-only
    
    return share.shared_with.includes(userId) || share.shared_by === userId;
  }

  // Get campaign permissions for user
  static getCampaignPermissions(campaignId: string, userId: string): CampaignShare['permissions'] | null {
    const shares = this.getCampaignShares();
    const share = shares.find(s => s.campaign_id === campaignId);
    
    if (!share) return null;
    if (share.shared_by === userId) {
      // Owner has all permissions
      return {
        can_view: true,
        can_edit: true,
        can_delete: true,
        can_reshare: true
      };
    }
    
    if (share.shared_with.includes(userId)) {
      return share.permissions;
    }
    
    return null;
  }

  // Log team activity
  static logActivity(activity: Omit<TeamActivity, 'id' | 'timestamp'>): void {
    try {
      const activities = this.getTeamActivity();
      
      const newActivity: TeamActivity = {
        id: 'activity_' + Date.now(),
        ...activity,
        timestamp: new Date().toISOString()
      };

      activities.unshift(newActivity);
      
      // Keep last 500 activities
      const trimmed = activities.slice(0, 500);
      localStorage.setItem(TEAM_ACTIVITY_KEY, JSON.stringify(trimmed));
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  }

  // Get team activity feed
  static getTeamActivity(limit = 50): TeamActivity[] {
    try {
      const stored = localStorage.getItem(TEAM_ACTIVITY_KEY);
      const activities: TeamActivity[] = stored ? JSON.parse(stored) : [];
      return activities.slice(0, limit);
    } catch (error) {
      console.error('Failed to get team activity:', error);
      return [];
    }
  }

  // Clear all workspace data (for demo/testing)
  static clearWorkspace(): void {
    localStorage.removeItem(WORKSPACE_KEY);
    localStorage.removeItem(WORKSPACE_MEMBERS_KEY);
    localStorage.removeItem(CAMPAIGN_SHARES_KEY);
    localStorage.removeItem(TEAM_ACTIVITY_KEY);
  }
}
