// Custom Auth Hook - Integrates Auth0 SDK with local auth fallback
// Tokens are managed by Auth0 in memory, NOT in localStorage

import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';
import { User, UserRole } from '../types/auth';
import { AuthService } from '../services/authService';
import { isAuth0Configured } from '../config/auth0Config';
import { setAuthTokenProvider } from '../utils/apiClient';

interface UseAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  loginWithAuth0: () => void;
  loginLocal: (role?: UserRole) => void;
  logout: () => void;
  getAccessToken: () => Promise<string | null>;
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

  // Convert Auth0 user to our User type
  const convertAuth0User = (auth0User: Record<string, unknown>): User | null => {
    if (!auth0User) return null;
    
    return {
      id: (auth0User.sub as string) || '',
      email: (auth0User.email as string) || '',
      name: (auth0User.name as string) || (auth0User.email as string) || '',
      role: (auth0User['https://ares.app/role'] as UserRole) || UserRole.ANALYST,
      created_at: (auth0User.updated_at as string) || new Date().toISOString(),
      last_login: new Date().toISOString(),
    };
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
          const data = (await res.json()) as { user: { id: string; email: string; name: string; role: UserRole } };
          const serverUser: User = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role,
            created_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
          };
          setLocalUser(serverUser);
          setIsLocalAuth(true);
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

  const logout = () => {
    fetch('/api/auth/login?provider=logout', { method: 'POST', credentials: 'include' }).catch(() => {});
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

  // Determine final auth state
  const isAuthenticated = auth0Configured ? auth0Authenticated : isLocalAuth;
  const isLoading = auth0Configured ? auth0Loading : false;
  const user = auth0Configured ? convertAuth0User(auth0User) : localUser;

  return {
    isAuthenticated,
    isLoading,
    user,
    loginWithAuth0,
    loginLocal,
    logout,
    getAccessToken,
  };
}
