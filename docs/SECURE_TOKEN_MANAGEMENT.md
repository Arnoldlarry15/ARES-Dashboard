# Secure Token Management with Auth0

## Overview

ARES Dashboard now implements secure token management following Auth0 best practices. **Tokens are NEVER stored in localStorage or sessionStorage** - they are managed in memory by the Auth0 SDK.

## Key Security Improvements

### ✅ What Changed

1. **Auth0 React SDK Integration**
   - Installed `@auth0/auth0-react` package
   - Wrapped application with `<Auth0Provider>`
   - Tokens stored in **memory only** (not localStorage)

2. **No Manual Token Storage**
   - Removed manual token storage from `AuthService`
   - Tokens accessed via `getAccessTokenSilently()` only when needed
   - Token management delegated to Auth0 SDK

3. **XSS-Resistant Architecture**
   - Tokens cannot be stolen via XSS attacks
   - No browser extensions can access tokens
   - Tokens die on page refresh (silent re-authentication)

4. **Backward Compatibility**
   - Local/demo auth still works for development
   - Gradual migration path to Auth0
   - Falls back gracefully when Auth0 not configured

## How It Works

### Token Storage (The Right Way)

```typescript
// ❌ WRONG - Manual localStorage storage
localStorage.setItem("token", accessToken);

// ✅ RIGHT - Auth0 manages tokens in memory
const { getAccessTokenSilently } = useAuth0();
const token = await getAccessTokenSilently();
```

### Token Lifecycle

1. **Login**: User authenticates via Auth0
2. **Token Acquisition**: Auth0 SDK fetches tokens (stored in memory)
3. **API Calls**: Get token just-in-time with `getAccessTokenSilently()`
4. **Page Refresh**: Silent authentication via refresh tokens
5. **Logout**: Tokens cleared from memory

### Architecture

```
┌─────────────────────┐
│  Auth0Provider      │  ← Manages tokens in memory
│  (Memory Storage)   │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  useAuthManager()   │  ← Unified auth hook
│  - loginWithAuth0() │
│  - getAccessToken() │  ← Only way to access tokens
│  - logout()         │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  Application        │
│  Components         │
└─────────────────────┘
```

## Configuration

### Quick Start

For complete step-by-step setup instructions, see [Auth0 Setup Guide](./AUTH0_SETUP_GUIDE.md).

### Environment Variables (Summary)

Add these to your `.env.local` or Vercel project:

```bash
# Frontend Auth0 Configuration (exposed to browser)
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your_client_id
VITE_AUTH0_AUDIENCE=https://your-api-identifier
```

### Auth0 Setup

1. Create an Auth0 **Single Page Application** (not Regular Web App)
2. Configure:
   - **Allowed Callback URLs**: `http://localhost:3000, https://your-domain.com`
   - **Allowed Logout URLs**: `http://localhost:3000, https://your-domain.com`
   - **Allowed Web Origins**: `http://localhost:3000, https://your-domain.com`
3. Enable **Refresh Token Rotation** in dashboard
4. Set token expiration appropriately (e.g., 1 hour)

## Code Examples

### Using Authentication

```typescript
import { useAuthManager } from './hooks/useAuthManager';

function MyComponent() {
  const { isAuthenticated, user, loginWithAuth0, logout, getAccessToken } = useAuthManager();

  const callProtectedAPI = async () => {
    // Get token just-in-time (NOT from localStorage)
    const token = await getAccessToken();
    
    const response = await fetch('/api/protected', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  };

  return (
    <div>
      {isAuthenticated ? (
        <>
          <p>Welcome, {user?.name}!</p>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <button onClick={loginWithAuth0}>Login with Auth0</button>
      )}
    </div>
  );
}
```

### Silent Authentication

Auth0 handles page refreshes automatically:

```typescript
// On page load, Auth0 SDK automatically:
// 1. Checks for valid session
// 2. Uses refresh token to get new access token
// 3. Restores authentication state
// All happens in memory - no localStorage needed!
```

## Security Benefits

### Before (Insecure)

```typescript
// ❌ Vulnerable to XSS
localStorage.setItem("token", accessToken);

// ❌ Browser extensions can read
const token = localStorage.getItem("token");

// ❌ Tokens persist after close
// ❌ Manual refresh logic required
// ❌ No automatic rotation
```

### After (Secure)

```typescript
// ✅ Tokens in memory (XSS-resistant)
const { getAccessTokenSilently } = useAuth0();

// ✅ Just-in-time token access
const token = await getAccessTokenSilently();

// ✅ Tokens cleared on page close
// ✅ Silent auth on refresh
// ✅ Automatic rotation by Auth0
```

## Migration Guide

### Step 1: Configure Auth0

Set up Auth0 SPA and add environment variables.

### Step 2: Use the New Hook

Replace old auth code:

```typescript
// ❌ Old (localStorage-based)
const session = AuthService.getSession();
const token = session?.token;

// ✅ New (Auth0 SDK)
const { getAccessToken } = useAuthManager();
const token = await getAccessToken();
```

### Step 3: Remove Manual Storage

Don't call `AuthService.saveSession()` for Auth0 tokens - only for local/demo auth.

## Testing

### Local Development

Without Auth0 configured, app falls back to local auth (demo mode).

### With Auth0

Set environment variables and test:

1. Login with Auth0
2. Verify tokens not in localStorage
3. Refresh page - should stay logged in
4. Close browser - should require re-login

## FAQs

**Q: What about offline-first apps?**
A: For offline apps, consider using secure storage with encryption. ARES is an online security platform, so memory storage is appropriate.

**Q: Will users have to re-login after page refresh?**
A: No! Auth0 uses refresh tokens for silent authentication.

**Q: What if localStorage is needed for other data?**
A: Use localStorage for non-sensitive data only (preferences, UI state). Never tokens.

**Q: How do I access user info?**
A: Use the `user` object from `useAuthManager()` hook.

## References

- [Auth0 React SDK Docs](https://auth0.com/docs/libraries/auth0-react)
- [Token Storage Best Practices](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## Mental Model

Think of tokens like temporary wristbands at a concert:

- ❌ Don't laminate them (localStorage)
- ❌ Don't store them in a drawer (sessionStorage)
- ✅ Show them at the gate when needed (just-in-time)
- ✅ Security replaces them automatically (Auth0 rotation)

**localStorage is like taping the wristband to your forehead.**

## Bottom Line

- ✅ Auth0 manages auth state
- ✅ Request tokens only when needed
- ✅ Never store them manually
- ✅ Backend verifies tokens, not frontend

This is the difference between "it works" and "it's professional."
