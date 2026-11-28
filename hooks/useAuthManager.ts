// Custom Auth Hook - Integrates Auth0 SDK with local auth fallback
// Tokens are managed by Auth0 in memory, NOT in localStorage

import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';
import { User, UserRole } from '../types/auth';
import { AuthService } from '../services/authService';
import { isAuth0Configured } from '../config/auth0Config';
import { getCsrfTokenFromCookie, setAuthTokenProvider } from '../utils/apiClient';

export interface OnboardingCompletePayload {
  user?: Partial<User> & { organizationId?: string };
  organizationId?: string;
  organization?: { id?: string };
}

interface UseAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  authError: string | null;
  clearAuthError: () => void;
  onboardingRequired: boolean;
  setOnboardingRequired: (required: boolean) => void;
  completeOnboarding: (payload?: OnboardingCompletePayload) => Promise<void>;
  loginWithAuth0: () => void;
  loginLocal: (role?: UserRole) => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  authentication_failed:
    'Authentication failed. Your sign-in could not be verified by the server. Please try signing in again or contact your administrator if the issue persists.',
  access_denied:
    'Access was denied by the identity provider. Please verify your account permissions and try again.',
  invalid_state:
    'Your sign-in session expired or had an invalid security state. Please clear cookies if needed and sign in again.',
  missing_code:
    'The identity provider did not return an authorization code. Please try signing in again.',
  auth0_not_configured:
    'Auth0 authentication is not configured on this server. Contact your administrator or use local authentication in development.',
  legacy_org_migration_required:
    'Your account belongs to a legacy organization that requires migration. Please contact your administrator to migrate your organization before signing in.',
  USER_DEACTIVATED:
    'Your account has been deactivated. Please contact your administrator for assistance.',
};

export type OnboardingStatusResolution =
  | { outcome: 'provisioned'; user: User }
  | { outcome: 'legacy_org_migration_required'; authError: string }
  | { outcome: 'user_deactivated'; authError: string }
  | { outcome: 'onboarding_required' };

export function resolveOnboardingStatusResponse(
  statusCode: number,
  data: {
    status?: string;
    code?: string;
    user?: { id: string; email: string; name?: string | null; role: UserRole; organizationId: string };
  } | null
): OnboardingStatusResolution {
  if (statusCode === 403 && data?.code === 'LEGACY_ORG_MIGRATION_REQUIRED') {
    return {
      outcome: 'legacy_org_migration_required',
      authError: AUTH_ERROR_MESSAGES.legacy_org_migration_required,
    };
  }

  if (statusCode === 403 && data?.code === 'USER_DEACTIVATED') {
    return {
      outcome: 'user_deactivated',
      authError: AUTH_ERROR_MESSAGES.USER_DEACTIVATED,
    };
  }

  if (statusCode >= 200 && statusCode < 300 && data?.status === 'provisioned' && data.user) {
    return {
      outcome: 'provisioned',
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name || data.user.email,
        role: data.user.role,
        organization_id: data.user.organizationId,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
      },
    };
  }

  return { outcome: 'onboarding_required' };
}

/**
 * Hydrates a local User object from an onboarding completion payload
 * (supporting both `create_organization` and `accept_invitation` responses).
 */
export function resolveCompletedOnboardingUser(
  payload: OnboardingCompletePayload | undefined,
  existingUser: User | null
): User | null {
  if (!payload?.user) {
    return existingUser;
  }

  const organizationId =
    payload.organizationId ||
    payload.organization?.id ||
    payload.user.organizationId ||
    payload.user.organization_id ||
    existingUser?.organization_id;

  return {
    id: payload.user.id || existingUser?.id || 'user',
    email: payload.user.email || existingUser?.email || '',
    name: payload.user.name || existingUser?.name || payload.user.email || 'User',
    role: payload.user.role || existingUser?.role || UserRole.ANALYST,
    organization_id: organizationId,
    created_at: existingUser?.created_at || new Date().toISOString(),
    last_login: new Date().toISOString(),
  };
}

function formatAuthErrorParam(errorCode: string, description: string | null): string {
  const baseMessage =
    AUTH_ERROR_MESSAGES[errorCode] ||
    `Authentication error (${errorCode}). Please try signing in again.`;
  if (description && !AUTH_ERROR_MESSAGES[errorCode]) {
    return `${baseMessage} Details: ${description}`;
  }
  return baseMessage;
}

export interface CompleteOnboardingOptions {
  payload?: OnboardingCompletePayload;
  localUser: User | null;
  auth0Configured: boolean;
  auth0Authenticated: boolean;
  getAccessTokenSilently: (options?: { cacheMode?: 'off' | 'on' | 'cache-only' }) => Promise<string>;
  setOnboardingCompletedInSession: (completed: boolean) => void;
  setOnboardingRequired: (required: boolean) => void;
  setLocalUser: (user: User | null) => void;
  setIsLocalAuth: (isLocal: boolean) => void;
}

/**
 * Completes onboarding, refreshing the Auth0 access token before clearing
 * `onboardingRequired` so dependent effects do not race with a stale token.
 */
export async function performOnboardingCompletion({
  payload,
  localUser,
  auth0Configured,
  auth0Authenticated,
  getAccessTokenSilently,
  setOnboardingCompletedInSession,
  setOnboardingRequired,
  setLocalUser,
  setIsLocalAuth,
}: CompleteOnboardingOptions): Promise<void> {
  setOnboardingCompletedInSession(true);

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.has('onboarding')) {
      params.delete('onboarding');
      const remaining = params.toString();
      const nextUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
  }

  if (payload?.user) {
    const updatedUser = resolveCompletedOnboardingUser(payload, localUser);
    if (updatedUser) {
      setLocalUser(updatedUser);
      setIsLocalAuth(true);
    }
  }

  if (auth0Configured && auth0Authenticated) {
    try {
      await getAccessTokenSilently({ cacheMode: 'off' });
    } catch {
      // Token refresh may require redirect if silent refresh is blocked; session cookie still applies
    }
    setOnboardingRequired(false);
    return;
  }

  setOnboardingRequired(false);

  if (!payload?.user && typeof window !== 'undefined') {
    // Cookie-based OAuth flow: reload so the updated HttpOnly session cookie takes effect
    window.location.replace(window.location.pathname);
  }
}

export function isOnboardingRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const errObj = error as {
    code?: unknown;
    error?: unknown;
    message?: unknown;
    data?: { code?: unknown; error?: unknown; message?: unknown };
  };
  const code = errObj.code ?? errObj.data?.code;
  const errField = errObj.error ?? errObj.data?.error;
  const message = errObj.message ?? errObj.data?.message;
  return (
    code === 'ONBOARDING_REQUIRED' ||
    errField === 'onboarding_required' ||
    errField === 'ONBOARDING_REQUIRED' ||
    (typeof message === 'string' &&
      (message.includes('ONBOARDING_REQUIRED') || message.includes('onboarding_required')))
  );
}

/**
 * Unified authentication hook
 * - Uses Auth0 SDK when configured (tokens in memory)
 * - Falls back to local auth for development
 * 
 * SECURITY: Never stores Auth0 tokens in localStorage
 * Tokens are accessed via getAccessToken() only when needed
 */
export function useAuthManager(): UseAuthResult {
  const auth0Configured = isAuth0Configured();
  
  // Auth0 hooks (only active if configured)
  const {
    isAuthenticated: auth0Authenticated,
    isLoading: auth0Loading,
    user: auth0User,
    loginWithRedirect,
    logout: auth0Logout,
    getAccessTokenSilently,
  } = auth0Configured ? useAuth0() : {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    loginWithRedirect: () => {},
    logout: () => {},
    getAccessTokenSilently: async () => '',
  };

  // Local auth state
  const [localUser, setLocalUser] = useState<User | null>(null);
  const [isLocalAuth, setIsLocalAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingRequired, setOnboardingRequired] = useState<boolean>(false);
  const [onboardingCompletedInSession, setOnboardingCompletedInSession] = useState<boolean>(false);

  // Parse ?error=... and ?onboarding=required query params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const errorDesc = params.get('error_description');
    const onboardingParam = params.get('onboarding');
    let urlModified = false;

    if (errorParam) {
      setAuthError(formatAuthErrorParam(errorParam, errorDesc));
      params.delete('error');
      params.delete('error_description');
      urlModified = true;
    }

    if (onboardingParam === 'required') {
      setOnboardingRequired(true);
    }

    if (urlModified) {
      const remaining = params.toString();
      const nextUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
  }, []);

  // Listen for global onboarding-required events from API callers
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnboardingEvent = () => {
      setOnboardingRequired(true);
    };
    window.addEventListener('ares:onboarding-required', handleOnboardingEvent);
    return () => window.removeEventListener('ares:onboarding-required', handleOnboardingEvent);
  }, []);

  // Initialize local auth on mount
  useEffect(() => {
    if (!auth0Configured) {
      const session = AuthService.getSession();
      if (session) {
        setLocalUser(session.user);
        setIsLocalAuth(true);
      }
    }
  }, [auth0Configured]);

  // If Auth0 SPA user is authenticated without an organizationId claim, check backend onboarding status
  useEffect(() => {
    if (
      !auth0Configured ||
      !auth0Authenticated ||
      !auth0User ||
      onboardingCompletedInSession ||
      auth0User['https://ares.app/org_id']
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/onboarding', {
          method: 'GET',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        let data: {
          status?: string;
          code?: string;
          user?: { id: string; email: string; name?: string | null; role: UserRole; organizationId: string };
        } | null = null;
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = null;
        }
        if (cancelled) return;

        const resolution = resolveOnboardingStatusResponse(res.status, data);
        if (resolution.outcome === 'provisioned') {
          setLocalUser(resolution.user);
          setIsLocalAuth(true);
          setOnboardingRequired(false);
          return;
        }
        if (
          resolution.outcome === 'legacy_org_migration_required' ||
          resolution.outcome === 'user_deactivated'
        ) {
          setAuthError(resolution.authError);
          setOnboardingRequired(false);
          return;
        }
      } catch {
        // Fall through to require onboarding
      }
      if (!cancelled) {
        setOnboardingRequired(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth0Configured, auth0Authenticated, auth0User, onboardingCompletedInSession, getAccessTokenSilently]);

  // Convert Auth0 user to our User type
  const convertAuth0User = (auth0User: Record<string, unknown>): User | null => {
    if (!auth0User) return null;
    
    return {
      id: (auth0User.sub as string) || '',
      email: (auth0User.email as string) || '',
      name: (auth0User.name as string) || (auth0User.email as string) || '',
      role: (auth0User['https://ares.app/role'] as UserRole) || UserRole.ANALYST,
      organization_id: (auth0User['https://ares.app/org_id'] as string) || undefined,
      created_at: (auth0User.updated_at as string) || new Date().toISOString(),
      last_login: new Date().toISOString(),
    };
  };

  const clearAuthError = () => setAuthError(null);

  const completeOnboarding = async (payload?: OnboardingCompletePayload) => {
    await performOnboardingCompletion({
      payload,
      localUser,
      auth0Configured,
      auth0Authenticated,
      getAccessTokenSilently,
      setOnboardingCompletedInSession,
      setOnboardingRequired,
      setLocalUser,
      setIsLocalAuth,
    });
  };

  const loginWithAuth0 = () => {
    if (auth0Configured) {
      loginWithRedirect();
    }
  };

  const loginLocal = async (_role: UserRole = UserRole.ANALYST) => {
    if (!auth0Configured) {
      try {
        const res = await fetch('/api/auth/login?provider=local', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          const data = (await res.json()) as {
            user: { id: string; email: string; name: string; role: UserRole; organizationId?: string };
          };
          const serverUser: User = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            organization_id: data.user.organizationId,
            created_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
          };
          setLocalUser(serverUser);
          setIsLocalAuth(true);
          setAuthError(null);
          return;
        }
        if (res.status === 403 || res.status === 401 || res.status === 503) {
          let errData: { code?: string; message?: string; error?: string } | null = null;
          try {
            errData = (await res.json()) as { code?: string; message?: string; error?: string };
          } catch {
            errData = null;
          }
          const message =
            errData?.code === 'USER_DEACTIVATED'
              ? AUTH_ERROR_MESSAGES.USER_DEACTIVATED
              : errData?.message || errData?.error || 'Local development authentication is disabled';
          setAuthError(message);
          return;
        }
      } catch {
        // Fallback to client-only state only if local dev server endpoint is not running
      }
      const session = AuthService.initLocalSession(UserRole.ANALYST);
      setLocalUser(session.user);
      setIsLocalAuth(true);
    }
  };

  const logout = async () => {
    const csrfToken = getCsrfTokenFromCookie();
    const headers: Record<string, string> = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
    try {
      await fetch('/api/auth/login?provider=logout', {
        method: 'POST',
        credentials: 'include',
        headers,
      });
    } catch {
      // Proceed with client-side logout even if the server request fails
    }
    setOnboardingRequired(false);
    if (auth0Configured && auth0Authenticated) {
      auth0Logout({ logoutParams: { returnTo: window.location.origin } });
    } else if (isLocalAuth) {
      AuthService.clearSession();
      setLocalUser(null);
      setIsLocalAuth(false);
    }
  };

  /**
   * Get access token - ONLY method to access tokens
   * Tokens are fetched just-in-time and never stored
   */
  const getAccessToken = async (): Promise<string | null> => {
    if (auth0Configured && auth0Authenticated) {
      try {
        return await getAccessTokenSilently();
      } catch (error) {
        console.error('Failed to get access token:', error);
        return null;
      }
    }
    return null;
  };

  useEffect(() => {
    setAuthTokenProvider(getAccessToken);
    return () => setAuthTokenProvider(null);
  }, [auth0Configured, auth0Authenticated]);

  // Determine final auth state (localUser/isLocalAuth also covers cookie-based OAuth/onboarding sessions)
  const isAuthenticated = (auth0Configured && auth0Authenticated) || isLocalAuth;
  const isLoading = auth0Configured ? auth0Loading : false;
  const user = localUser ?? (auth0Configured ? convertAuth0User(auth0User) : null);

  return {
    isAuthenticated,
    isLoading,
    user,
    authError,
    clearAuthError,
    onboardingRequired,
    setOnboardingRequired,
    completeOnboarding,
    loginWithAuth0,
    loginLocal,
    logout,
    getAccessToken,
  };
}
