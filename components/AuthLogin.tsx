import React, { useState } from 'react';
import { User, UserRole, getRoleInfo } from '../types/auth';
import { Lock, User as UserIcon, ChevronRight, Shield, AlertTriangle, X, Building2, KeyRound, Loader2 } from 'lucide-react';
import { isAuth0Configured } from '../config/auth0Config';
import { getCsrfTokenFromCookie } from '../utils/apiClient';

interface AuthLoginProps {
  onLogin: (role?: UserRole) => void;
  onAuth0Login?: () => void;
  authError?: string | null;
  onDismissError?: () => void;
  onboardingRequired?: boolean;
  onOnboardingComplete?: (payload?: {
    user?: Partial<User> & { organizationId?: string };
    organizationId?: string;
    organization?: { id?: string };
  }) => Promise<void>;
  getAccessToken?: () => Promise<string | null>;
  onLogout?: () => Promise<void>;
}

export function buildOnboardingCompletionPayload(data: unknown): {
  user?: Partial<User> & { organizationId?: string };
  organizationId?: string;
  organization?: { id?: string };
} {
  const typed = (data ?? {}) as {
    user?: Partial<User> & { organizationId?: string };
    organizationId?: string;
    organization?: { id?: string };
  };
  return {
    user: typed.user,
    organizationId:
      typed.organizationId ||
      typed.organization?.id ||
      typed.user?.organizationId ||
      typed.user?.organization_id,
    organization: typed.organization,
  };
}

export const AuthLogin: React.FC<AuthLoginProps> = ({
  onLogin,
  onAuth0Login,
  authError,
  onDismissError,
  onboardingRequired = false,
  onOnboardingComplete,
  getAccessToken,
  onLogout,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.ANALYST);
  const [onboardingMode, setOnboardingMode] = useState<'create' | 'invite'>('create');
  const [organizationName, setOrganizationName] = useState('');
  const [invitationToken, setInvitationToken] = useState('');
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const auth0Enabled = isAuth0Configured();

  const roles = [
    UserRole.ADMIN,
    UserRole.RED_TEAM_LEAD,
    UserRole.ANALYST,
    UserRole.VIEWER
  ];

  const handleLocalLogin = (role: UserRole) => {
    onLogin(role);
  };

  const handleAuth0Login = () => {
    if (onAuth0Login) {
      onAuth0Login();
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingError(null);

    const body =
      onboardingMode === 'create'
        ? { action: 'create_organization', organizationName: organizationName.trim() }
        : { action: 'accept_invitation', token: invitationToken.trim() };

    if (onboardingMode === 'create' && !body.organizationName) {
      setOnboardingError('Please enter an organization name.');
      return;
    }
    if (onboardingMode === 'invite' && !body.token) {
      setOnboardingError('Please enter your invitation token.');
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (getAccessToken) {
        try {
          const token = await getAccessToken();
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        } catch {
          // Fall back to cookie-based session if SPA token is unavailable
        }
      }

      const csrfToken = getCsrfTokenFromCookie();
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch('/api/onboarding', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOnboardingError(
          (data as { error?: string; message?: string }).error ||
            (data as { message?: string }).message ||
            'Unable to complete organization onboarding. Please verify your details and try again.'
        );
        return;
      }

      if (onOnboardingComplete) {
        await onOnboardingComplete(buildOnboardingCompletionPayload(data));
      }
    } catch {
      setOnboardingError('Network error while contacting /api/onboarding. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated background with teal, gold, and red */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A192F] via-[#1A0A14] to-[#0A192F]"></div>
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md p-8">
        <div className="glass-strong rounded-3xl p-8 shadow-2xl border border-white/10">
          {/* Logo and branding */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-6">
              <img 
                src="/logo.jpg" 
                alt="ARES Dashboard" 
                className="h-24 w-auto object-contain"
              />
            </div>
          </div>

          {/* Actionable authentication error banner */}
          {authError && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 flex items-start gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs leading-relaxed">
                <div className="font-bold text-red-300 mb-1">Authentication Failed</div>
                <p>{authError}</p>
              </div>
              {onDismissError && (
                <button
                  type="button"
                  onClick={onDismissError}
                  aria-label="Dismiss authentication error"
                  className="text-red-300 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {onboardingRequired ? (
            <div>
              <div className="mb-6 text-center">
                <h2 className="text-lg font-bold text-white mb-1">Organization Onboarding</h2>
                <p className="text-xs text-slate-400">
                  Your account is authenticated, but not yet linked to an organization. Create a new organization or join an existing one with an invitation token.
                </p>
              </div>

              {/* Onboarding mode tabs */}
              <div className="grid grid-cols-2 gap-2 mb-6 p-1 glass rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setOnboardingMode('create');
                    setOnboardingError(null);
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    onboardingMode === 'create'
                      ? 'bg-teal-500 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Create Org</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOnboardingMode('invite');
                    setOnboardingError(null);
                  }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    onboardingMode === 'invite'
                      ? 'bg-teal-500 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Join with Token</span>
                </button>
              </div>

              {onboardingError && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-xs flex items-start gap-2"
                >
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{onboardingError}</span>
                </div>
              )}

              <form onSubmit={handleOnboardingSubmit} className="space-y-4">
                {onboardingMode === 'create' ? (
                  <div>
                    <label
                      htmlFor="organization-name-input"
                      className="block text-xs font-bold text-slate-300 mb-2"
                    >
                      Organization Name
                    </label>
                    <input
                      id="organization-name-input"
                      type="text"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      placeholder="e.g., Acme Red Team"
                      disabled={isSubmitting}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="invitation-token-input"
                      className="block text-xs font-bold text-slate-300 mb-2"
                    >
                      Invitation Token
                    </label>
                    <input
                      id="invitation-token-input"
                      type="text"
                      value={invitationToken}
                      onChange={(e) => setInvitationToken(e.target.value)}
                      placeholder="Paste your invitation token"
                      disabled={isSubmitting}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-6 py-4 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 disabled:opacity-60 rounded-xl transition-all duration-200 text-white font-bold shadow-lg glow-teal hover:glow-teal-strong group flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Completing Setup...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {onboardingMode === 'create'
                          ? 'Create Organization & Continue'
                          : 'Accept Invitation & Continue'}
                      </span>
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                    </>
                  )}
                </button>
              </form>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    void onLogout();
                  }}
                  className="w-full mt-4 text-center text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Sign out and use a different account
                </button>
              )}
            </div>
          ) : (
            <>
          {/* Auth0 login (if configured) */}
          {auth0Enabled && (
            <>
              <button
                onClick={handleAuth0Login}
                className="w-full px-6 py-4 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 rounded-xl transition-all duration-200 text-white font-bold shadow-lg glow-teal hover:glow-teal-strong group flex items-center justify-center gap-2 mb-4"
              >
                <Shield className="w-5 h-5" />
                <span>Sign In with Auth0</span>
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 glass rounded-lg text-slate-400">Or use local auth</span>
                </div>
              </div>
            </>
          )}

          {/* Local authentication notice */}
          <div className="mb-6 p-4 glass rounded-xl border border-teal-500/30">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-teal-400" />
              <span className="text-sm font-bold text-teal-400">
                {auth0Enabled ? 'Local Authentication (Dev Only)' : 'Local Authentication'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {auth0Enabled 
                ? 'For development purposes only. Production uses secure Auth0 authentication.'
                : 'Select a role to explore ARES Dashboard with role-based access control and audit logging.'
              }
            </p>
          </div>

          {/* Role selection */}
          <div className="space-y-3 mb-6">
            <label className="block text-sm font-bold text-slate-300 mb-3">Select Your Role</label>
            {roles.map(role => {
              const roleInfo = getRoleInfo(role);
              const isSelected = selectedRole === role;
              
              return (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-300 flex items-center justify-between group ${
                    isSelected
                      ? 'glass-strong border border-teal-500/40 shadow-lg glow-teal'
                      : 'glass border border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      isSelected ? 'bg-gradient-to-br from-teal-500 to-teal-600' : 'glass'
                    }`}>
                      <UserIcon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <div className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {roleInfo.label}
                      </div>
                      <div className="text-xs text-slate-500">
                        {roleInfo.description}
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Login button */}
          <button
            onClick={() => handleLocalLogin(selectedRole)}
            className="w-full px-6 py-4 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 rounded-xl transition-[background-image,box-shadow] duration-200 text-white font-bold shadow-lg glow-teal hover:glow-teal-strong group flex items-center justify-center gap-2"
            style={{ contain: 'layout style paint', willChange: 'box-shadow, background-image' }}
          >
            <span>Enter Dashboard</span>
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
          </button>

          {/* Footer notice */}
          <p className="text-center text-xs text-slate-500 mt-6">
            Session expires in 24 hours • All actions are logged for audit
          </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
