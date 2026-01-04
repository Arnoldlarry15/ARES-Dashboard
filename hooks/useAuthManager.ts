// Custom Auth Hook - Integrates Auth0 SDK with local auth fallback
// Tokens are managed by Auth0 in memory, NOT in localStorage

import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';
import { User, UserRole } from '../types/auth';
import { AuthService } from '../services/authService';
import { isAuth0Configured } from '../config/auth0Config';

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

  const loginLocal = (role: UserRole = UserRole.ANALYST) => {
    if (!auth0Configured) {
      const session = AuthService.initLocalSession(role);
      setLocalUser(session.user);
      setIsLocalAuth(true);
    }
  };

  const logout = () => {
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
        // Auth0 SDK manages tokens in memory
        // This fetches them securely without exposing to localStorage
        return await getAccessTokenSilently();
      } catch (error) {
        console.error('Failed to get access token:', error);
        return null;
      }
    } else if (isLocalAuth) {
      // For local auth, return the token from session
      const session = AuthService.getSession();
      return session?.token || null;
    }
    return null;
  };

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
