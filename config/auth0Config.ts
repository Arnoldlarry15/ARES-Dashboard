// Auth0 Configuration for React SPA
// Tokens are stored in memory by Auth0, not in localStorage

export const auth0Config = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || '',
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || '',
  authorizationParams: {
    redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
    audience: import.meta.env.VITE_AUTH0_AUDIENCE || '',
    scope: 'openid profile email offline_access',
  },
  // Cache location is memory by default - tokens NOT stored in localStorage
  cacheLocation: 'memory' as const,
  // Use refresh tokens for silent authentication
  useRefreshTokens: true,
  // Automatically renew tokens before expiry
  useRefreshTokensFallback: false,
};

// Helper to check if Auth0 is configured
export const isAuth0Configured = (): boolean => {
  return !!(auth0Config.domain && auth0Config.clientId);
};
