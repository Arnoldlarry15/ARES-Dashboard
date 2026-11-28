import React, { useState, useEffect, useCallback } from 'react';
import {
  UserAPI,
  ApiError,
  type User as ApiUser,
  type OrganizationInvitation,
} from '../utils/apiClient';
import { UserRole, getRoleInfo, type User as AuthUser } from '../types/auth';
import {
  Users,
  UserPlus,
  Trash2,
  X,
  Mail,
  Shield,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Key,
} from 'lucide-react';

interface TeamManagementProps {
  onClose: () => void;
  theme?: 'light' | 'dark';
  currentUser?: AuthUser | null;
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.data as { message?: string; error?: string } | undefined;
    return data?.message || data?.error || err.message || fallback;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export const TeamManagement: React.FC<TeamManagementProps> = ({
  onClose,
  theme = 'dark',
  currentUser,
}) => {
  const [members, setMembers] = useState<ApiUser[]>([]);
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.ANALYST);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [deactivatingMemberId, setDeactivatingMemberId] = useState<string | null>(null);
  const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const orgId = currentUser?.organization_id;

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const loadTeamData = useCallback(async () => {
    if (!orgId) {
      setErrorMessage('Organization context is required to load team members.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const [orgMembers, orgInvitations] = await Promise.all([
        UserAPI.findByOrgId(orgId),
        UserAPI.listInvitations(),
      ]);
      setMembers(orgMembers);
      setInvitations(orgInvitations);
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error, 'Failed to load team members and invitations.'));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadTeamData();
  }, [loadTeamData]);

  const openInviteModal = () => {
    setInviteEmail('');
    setInviteRole(UserRole.ANALYST);
    setInviteError(null);
    setCreatedToken(null);
    setCopiedToken(false);
    setShowInviteModal(true);
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setCreatedToken(null);
    setInviteError(null);
    setCopiedToken(false);
  };

  const handleInvite = async () => {
    setInviteSubmitting(true);
    setInviteError(null);
    try {
      const trimmedEmail = inviteEmail.trim();
      const result = await UserAPI.createInvitation({
        invitedEmail: trimmedEmail || undefined,
        role: inviteRole,
      });
      setCreatedToken(result.token);
      setCopiedToken(false);
      await loadTeamData();
      showToast(
        trimmedEmail ? `Invitation created for ${trimmedEmail}` : 'Invitation created'
      );
    } catch (error: unknown) {
      setInviteError(getApiErrorMessage(error, 'Failed to create invitation.'));
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleCopyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      setInviteError('Unable to copy automatically. Please copy the token manually.');
    }
  };

  const handleRevokeInvitation = async (id: string) => {
    setRevokingInvitationId(id);
    setErrorMessage(null);
    try {
      await UserAPI.revokeInvitation(id);
      await loadTeamData();
      showToast('Invitation revoked');
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error, 'Failed to revoke invitation.'));
    } finally {
      setRevokingInvitationId(null);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    setUpdatingMemberId(memberId);
    setErrorMessage(null);
    try {
      const updated = await UserAPI.update(memberId, { role: newRole });
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: updated.role } : m))
      );
      showToast('Member role updated');
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error, 'Failed to update member role.'));
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleDeactivate = async (memberId: string, displayName: string) => {
    if (memberId === currentUser?.id) {
      setErrorMessage('Administrators cannot deactivate their own account.');
      return;
    }

    setDeactivatingMemberId(memberId);
    setErrorMessage(null);
    try {
      await UserAPI.delete(memberId);
      await loadTeamData();
      showToast(`Deactivated ${displayName}`);
    } catch (error: unknown) {
      setErrorMessage(getApiErrorMessage(error, 'Failed to deactivate member.'));
    } finally {
      setDeactivatingMemberId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div
        className={`rounded-3xl w-full max-w-3xl shadow-2xl border animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col ${
          theme === 'light' ? 'bg-white/95 border-slate-200' : 'glass-strong border-white/10'
        }`}
      >
        {/* Header */}
        <div className={`p-6 border-b ${theme === 'light' ? 'border-slate-200' : 'border-white/10'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-xl ${
                  theme === 'light' ? 'bg-teal-100' : 'bg-gradient-to-br from-cyan-500 to-cyan-600'
                }`}
              >
                <Users className={`w-5 h-5 ${theme === 'light' ? 'text-teal-600' : 'text-white'}`} />
              </div>
              <div>
                <h2 className={`text-2xl font-black ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                  Team Management
                </h2>
                <p className={`text-sm ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
                  Organization Members &amp; Invitations
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 glass rounded-lg transition-all ${
                theme === 'light'
                  ? 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
                  : 'hover:glass-strong text-slate-400 hover:text-white'
              }`}
              aria-label="Close team management"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div
              role="alert"
              className={`flex items-start justify-between gap-3 p-4 rounded-xl border ${
                theme === 'light'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-red-500/10 border-red-500/30 text-red-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                <span className="text-sm font-medium">{errorMessage}</span>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-xs font-bold opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Members Header */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                  Team Members
                </span>
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-bold ${
                    theme === 'light' ? 'bg-teal-100 text-teal-700' : 'bg-cyan-500/20 text-cyan-400'
                  }`}
                >
                  {members.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void loadTeamData()}
                  disabled={loading}
                  className={`p-2 glass rounded-xl transition-all ${
                    theme === 'light'
                      ? 'hover:bg-slate-100 text-slate-600'
                      : 'hover:glass-strong text-slate-300'
                  }`}
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={openInviteModal}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all ${
                    theme === 'light'
                      ? 'bg-teal-600 hover:bg-teal-500 text-white'
                      : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white glow-emerald'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  Invite Member
                </button>
              </div>
            </div>

            {loading && members.length === 0 ? (
              <div className={`text-sm py-6 text-center ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                Loading team members...
              </div>
            ) : members.length === 0 ? (
              <div className={`text-sm py-6 text-center ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                No active members found.
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => {
                  const isSelf = member.id === currentUser?.id;
                  const displayName = member.name || member.email;
                  return (
                    <div
                      key={member.id}
                      className={`glass rounded-xl p-4 border transition-all ${
                        theme === 'light'
                          ? 'border-slate-200 hover:border-slate-300'
                          : 'border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`p-2 glass rounded-lg ${theme === 'light' ? 'bg-slate-100' : ''}`}>
                            <Shield className={`w-4 h-4 ${theme === 'light' ? 'text-teal-600' : 'text-cyan-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-bold text-sm truncate ${
                                  theme === 'light' ? 'text-slate-900' : 'text-white'
                                }`}
                              >
                                {displayName}
                              </span>
                              {isSelf && (
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                                    theme === 'light'
                                      ? 'bg-teal-100 text-teal-700'
                                      : 'bg-cyan-500/20 text-cyan-400'
                                  }`}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Mail className={`w-3 h-3 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`} />
                              <span
                                className={`text-xs truncate ${
                                  theme === 'light' ? 'text-slate-600' : 'text-slate-400'
                                }`}
                              >
                                {member.email}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            aria-label={`Role for ${displayName}`}
                            value={member.role}
                            disabled={updatingMemberId === member.id}
                            onChange={(e) => void handleRoleChange(member.id, e.target.value as UserRole)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 transition-all ${
                              theme === 'light'
                                ? 'bg-slate-100 border border-slate-200 text-slate-800 focus:ring-teal-500/40'
                                : 'glass-strong border border-white/10 text-slate-200 focus:ring-cyan-500/40'
                            }`}
                          >
                            <option value={UserRole.ANALYST}>Security Analyst</option>
                            <option value={UserRole.RED_TEAM_LEAD}>Red Team Lead</option>
                            <option value={UserRole.VIEWER}>Viewer</option>
                            <option value={UserRole.ADMIN}>Administrator</option>
                          </select>

                          {!isSelf && (
                            <button
                              onClick={() => void handleDeactivate(member.id, displayName)}
                              disabled={deactivatingMemberId === member.id}
                              className={`p-2 glass rounded-lg transition-all disabled:opacity-50 ${
                                theme === 'light'
                                  ? 'hover:bg-red-50 text-red-600 hover:text-red-700'
                                  : 'hover:glass-strong text-red-400 hover:text-red-300'
                              }`}
                              title="Deactivate member"
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
            )}
          </div>

          {/* Invitations Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-sm font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                Invitations
              </span>
              <span
                className={`px-2 py-1 rounded-lg text-xs font-bold ${
                  theme === 'light' ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-300'
                }`}
              >
                {invitations.length}
              </span>
            </div>

            {invitations.length === 0 ? (
              <div
                className={`text-xs py-4 px-4 rounded-xl border ${
                  theme === 'light'
                    ? 'border-slate-200 text-slate-500 bg-slate-50/50'
                    : 'border-white/5 text-slate-400 bg-white/[0.02]'
                }`}
              >
                No invitations have been created yet.
              </div>
            ) : (
              <div className="space-y-2">
                {invitations.map((inv) => {
                  const isUsed = Boolean(inv.usedAt);
                  const isExpired = !isUsed && new Date(inv.expiresAt).getTime() < Date.now();
                  const statusLabel = isUsed ? 'used' : isExpired ? 'expired' : 'pending';
                  const roleLabel = getRoleInfo(inv.role as UserRole)?.label || inv.role;

                  return (
                    <div
                      key={inv.id}
                      className={`glass rounded-xl p-3.5 border flex items-center justify-between gap-3 ${
                        theme === 'light' ? 'border-slate-200' : 'border-white/5'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-bold truncate ${
                              theme === 'light' ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {inv.invitedEmail || 'Open invitation (any email)'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                              statusLabel === 'pending'
                                ? theme === 'light'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-amber-500/20 text-amber-300'
                                : statusLabel === 'used'
                                ? theme === 'light'
                                  ? 'bg-teal-100 text-teal-700'
                                  : 'bg-cyan-500/20 text-cyan-400'
                                : theme === 'light'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-white/10 text-slate-400'
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        <div className={`text-xs mt-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                          Role: {roleLabel} • Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </div>
                      </div>

                      {!isUsed && (
                        <button
                          onClick={() => void handleRevokeInvitation(inv.id)}
                          disabled={revokingInvitationId === inv.id}
                          className={`p-2 glass rounded-lg transition-all shrink-0 disabled:opacity-50 ${
                            theme === 'light'
                              ? 'hover:bg-red-50 text-red-600 hover:text-red-700'
                              : 'hover:glass-strong text-red-400 hover:text-red-300'
                          }`}
                          title="Revoke invitation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-6 border-t ${theme === 'light' ? 'border-slate-200' : 'border-white/10'}`}>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Organization ID: {orgId || '—'}</span>
            <span>{members.length} active member{members.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className={`rounded-2xl p-6 w-full max-w-md shadow-2xl border ${
              theme === 'light' ? 'bg-white border-slate-200' : 'glass-strong border-white/10'
            }`}
          >
            <h3 className={`text-xl font-black mb-4 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
              {createdToken ? 'Invitation Token Created' : 'Invite Team Member'}
            </h3>

            {inviteError && (
              <div
                role="alert"
                className={`mb-4 p-3 rounded-xl border text-xs font-medium ${
                  theme === 'light'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-red-500/10 border-red-500/30 text-red-200'
                }`}
              >
                {inviteError}
              </div>
            )}

            {createdToken ? (
              <div className="space-y-4">
                <p className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>
                  Share this one-time invitation token with your teammate. For security, it will not be shown again.
                </p>
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                    theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-900'
                      : 'bg-black/30 border-white/10 text-cyan-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Key className="w-4 h-4 shrink-0" />
                    <code className="text-xs font-mono break-all select-all">{createdToken}</code>
                  </div>
                  <button
                    onClick={() => void handleCopyToken()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 ${
                      theme === 'light'
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300'
                    }`}
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedToken ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    onClick={closeInviteModal}
                    className={`px-5 py-2.5 rounded-xl font-bold text-sm ${
                      theme === 'light'
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white'
                    }`}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label
                      className={`block text-sm font-bold mb-2 ${
                        theme === 'light' ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      Email Address (optional)
                    </label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      className={`w-full px-4 py-3 rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 transition-all font-medium ${
                        theme === 'light'
                          ? 'bg-white border border-slate-200 text-slate-900 focus:ring-teal-500/40'
                          : 'glass-strong text-slate-200 focus:ring-cyan-500/40'
                      }`}
                    />
                  </div>

                  <div>
                    <label
                      className={`block text-sm font-bold mb-2 ${
                        theme === 'light' ? 'text-slate-700' : 'text-slate-300'
                      }`}
                    >
                      Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as UserRole)}
                      className={`w-full px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 transition-all font-medium ${
                        theme === 'light'
                          ? 'bg-white border border-slate-200 text-slate-900 focus:ring-teal-500/40'
                          : 'glass-strong text-slate-200 focus:ring-cyan-500/40'
                      }`}
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
                    onClick={closeInviteModal}
                    disabled={inviteSubmitting}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all ${
                      theme === 'light'
                        ? 'glass hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                        : 'glass hover:glass-strong text-slate-300 hover:text-white'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleInvite()}
                    disabled={inviteSubmitting}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 ${
                      theme === 'light'
                        ? 'bg-teal-600 hover:bg-teal-500 text-white'
                        : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white'
                    }`}
                  >
                    {inviteSubmitting ? 'Creating...' : 'Create Invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-[220] px-6 py-3 rounded-xl border shadow-2xl animate-in slide-in-from-bottom ${
            theme === 'light' ? 'bg-white border-teal-200 shadow-lg' : 'glass-strong border-cyan-500/30'
          }`}
        >
          <p className={`text-sm font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
            {notification}
          </p>
        </div>
      )}
    </div>
  );
};
