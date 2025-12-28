import React, { useState, useEffect } from 'react';
import { WorkspaceService } from '../services/workspaceService';
import { WorkspaceMember, Organization } from '../types/workspace';
import { UserRole, getRoleInfo } from '../types/auth';
import { Users, UserPlus, Trash2, X, Mail, Shield } from 'lucide-react';

interface TeamManagementProps {
  onClose: () => void;
}

export const TeamManagement: React.FC<TeamManagementProps> = ({ onClose }) => {
  const [workspace, setWorkspace] = useState<Organization | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.ANALYST);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    loadWorkspace();
  }, []);

  const loadWorkspace = () => {
    const ws = WorkspaceService.getOrCreateWorkspace();
    const mbrs = WorkspaceService.getMembers();
    setWorkspace(ws);
    setMembers(mbrs);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    try {
      await WorkspaceService.inviteMember(inviteEmail, inviteRole);
      loadWorkspace();
      setShowInviteModal(false);
      setInviteEmail('');
      setNotification(`Invitation sent to ${inviteEmail}`);
      setTimeout(() => setNotification(null), 2000);
    } catch (error: unknown) {
      setNotification(error instanceof Error ? error.message : 'Failed to invite member');
      setTimeout(() => setNotification(null), 2000);
    }
  };

  const handleRemove = (userId: string, name: string) => {
    if (WorkspaceService.removeMember(userId)) {
      loadWorkspace();
      setNotification(`Removed ${name}`);
      setTimeout(() => setNotification(null), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="glass-strong rounded-3xl w-full max-w-3xl shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">Team Management</h2>
                <p className="text-sm text-slate-400">{workspace?.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 glass hover:glass-strong rounded-lg transition-all text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-300">Team Members</span>
              <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-bold">
                {members.length}
              </span>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 rounded-xl text-white text-sm font-bold shadow-lg glow-emerald transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
          </div>

          <div className="space-y-2">
            {members.map(member => {
              const roleInfo = getRoleInfo(member.role);
              return (
                <div
                  key={member.user_id}
                  className="glass rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="p-2 glass rounded-lg">
                        <Shield className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{member.name}</span>
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                            member.status === 'active'
                              ? 'bg-cyan-500/20 text-cyan-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {member.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span className="text-xs text-slate-400">{member.email}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 glass rounded-lg">
                        <span className="text-xs font-bold text-slate-300">{roleInfo.label}</span>
                      </div>
                      {member.status !== 'active' && (
                        <button
                          onClick={() => handleRemove(member.user_id, member.name)}
                          className="p-2 glass hover:glass-strong rounded-lg text-red-400 hover:text-red-300 transition-all"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Workspace ID: {workspace?.id.slice(0, 16)}...</span>
            <span>Created {workspace && new Date(workspace.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-strong rounded-2xl p-6 w-full max-w-md shadow-2xl border border-white/10">
            <h3 className="text-xl font-black text-white mb-4">Invite Team Member</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-4 py-3 glass-strong rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-300 mb-2">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full px-4 py-3 glass-strong rounded-xl text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 transition-all font-medium"
                >
                  <option value={UserRole.ANALYST}>Security Analyst</option>
                  <option value={UserRole.RED_TEAM_LEAD}>Red Team Lead</option>
                  <option value={UserRole.VIEWER}>Viewer</option>
                  <option value={UserRole.ADMIN}>Administrator</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-3 glass hover:glass-strong rounded-xl text-slate-300 hover:text-white font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 rounded-xl text-white font-bold shadow-lg transition-all"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[220] glass-strong px-6 py-3 rounded-xl border border-cyan-500/30 shadow-2xl animate-in slide-in-from-bottom">
          <p className="text-sm font-bold text-white">{notification}</p>
        </div>
      )}
    </div>
  );
};
