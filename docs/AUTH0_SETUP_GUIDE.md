# Auth0 Setup Guide for ARES Dashboard

## Complete Step-by-Step Setup

### STEP 1: Create Auth0 Application

ARES supports two Auth0 integration patterns depending on how you deploy and authenticate:

1. **Single Page Web Application (SPA RS256 Bearer Flow)** — used by the React frontend (`@auth0/auth0-react` with `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and optional `VITE_AUTH0_AUDIENCE`). The SPA obtains an RS256 access token in memory and sends `Authorization: Bearer <token>` to `/api/*` endpoints.
2. **Regular Web Application (Backend OAuth2 Callback Flow)** — used when authenticating via `/api/auth/login?provider=auth0` and `/api/auth/callback?provider=auth0` (configured with `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and `AUTH0_CALLBACK_URL`). The backend exchanges the authorization code and issues `HttpOnly`, `SameSite=Lax` session cookies.

To set up the **Single Page Web Application** flow (recommended for React SPA):

1. Go to [Auth0 Dashboard](https://manage.auth0.com)
2. Navigate to **Applications** → **Create Application**
3. Name it: `ARES Dashboard`
4. Choose **Single Page Web Application**
5. Select **React** as the technology
6. **Note**: Do not use a Regular Web App client ID for the SPA PKCE flow (Regular Web Apps require a client secret and are only used for the server-side `/api/auth/login?provider=auth0` + `/api/auth/callback?provider=auth0` flow). See [AUTHENTICATION.md](./AUTHENTICATION.md) for backend OAuth2 callback configuration and the required `https://ares.app/org_id` Post-Login Action.

### STEP 2: Configure Application Settings (Critical)

Inside the application settings page, configure:

**Allowed Callback URLs:**
```
http://localhost:5173
http://localhost:5173/callback
```

**Allowed Logout URLs:**
```
http://localhost:5173
```

**Allowed Web Origins:**
```
http://localhost:5173
```

> ⚠️ **CRITICAL**: If you miss Web Origins, silent auth will break. This is non-negotiable.

Click **Save Changes** at the bottom of the page.

### STEP 3: Copy Your Credentials

From the same settings page, copy:

- **Domain** (e.g., `dev-xyz123.us.auth0.com`)
- **Client ID** (long alphanumeric string)

> 📝 Domain + Client ID are safe in frontend code but treat them cleanly.

### STEP 4: Install Auth0 React SDK

Already installed! ✅

```bash
npm install @auth0/auth0-react
```

### STEP 5: Create Environment Variables

Create a `.env.local` file in the root directory:

```bash
VITE_AUTH0_DOMAIN=dev-xxxxxxxx.us.auth0.com
VITE_AUTH0_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
```

**Important:**
- ✅ Must start with `VITE_` prefix
- ✅ Restart dev server after changes (`npm run dev`)
- ✅ Never commit `.env.local` to git

### STEP 6: Verify App Wrapper

Check `index.tsx` - should already be configured:

```typescript
import { Auth0Provider } from '@auth0/auth0-react';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin
      }}
    >
      <App />
    </Auth0Provider>
  </React.StrictMode>
);
```

✅ **Already implemented in ARES!**

### STEP 7: Using Auth0 in Components

The `useAuthManager` hook wraps Auth0 functionality:

```typescript
import { useAuthManager } from './hooks/useAuthManager';

function MyComponent() {
  const {
    isAuthenticated,
    isLoading,
    user,
    loginWithAuth0,
    logout,
    getAccessToken
  } = useAuthManager();

  if (isLoading) return <div>Loading...</div>;

  return (
    <>
      {!isAuthenticated && (
        <button onClick={loginWithAuth0}>
          Log In with Auth0
        </button>
      )}

      {isAuthenticated && (
        <>
          <p>Welcome, {user?.name}!</p>
          <button onClick={logout}>
            Log Out
          </button>
        </>
      )}
    </>
  );
}
```

### STEP 8: Protected Routes (Already Implemented)

ARES uses authentication at the app level:

```typescript
// In App.tsx
if (!isAuthenticated) {
  return <AuthLogin onAuth0Login={loginWithAuth0} />;
}

// Authenticated users see the full dashboard
return <Dashboard />;
```

For individual route protection, you can use:

```typescript
import { withAuthenticationRequired } from '@auth0/auth0-react';

function SecureComponent() {
  return <div>Protected content</div>;
}

export default withAuthenticationRequired(SecureComponent);
```

## Testing Your Setup

1. **Start dev server:**
   ```bash
   npm run dev
   ```

2. **Navigate to:** `http://localhost:5173`

3. **Click "Sign In with Auth0"** button

4. **You should be redirected to Auth0 login page**

5. **After login, redirected back to ARES Dashboard**

6. **Verify:** Open DevTools → Application → Local Storage
   - ✅ Should be EMPTY (no tokens)
   - ✅ Tokens stored in memory only

## Common Issues & Fixes

### Issue: "Auth0 is not configured"

**Fix:** Verify environment variables:
```bash
# Check they exist
echo $VITE_AUTH0_DOMAIN
echo $VITE_AUTH0_CLIENT_ID

# Restart dev server
npm run dev
```

### Issue: Redirect loop after login

**Fix:** 
1. Check **Allowed Callback URLs** in Auth0 dashboard
2. Ensure `http://localhost:5173` is listed
3. Clear browser cache and cookies
4. Try again

### Issue: Silent auth fails (re-login on refresh)

**Fix:**
1. Verify **Allowed Web Origins** is set to `http://localhost:5173`
2. Check that `useRefreshTokens: true` in `auth0Config.ts`
3. Ensure refresh tokens are enabled in Auth0 dashboard

### Issue: CORS errors

**Fix:**
1. Add `http://localhost:5173` to **Allowed Web Origins**
2. Save changes in Auth0 dashboard
3. Wait ~1 minute for changes to propagate

## Production Deployment

When deploying to production (e.g., Vercel):

1. **Add production URLs to Auth0:**
   - Allowed Callback URLs: `https://your-domain.com`
   - Allowed Logout URLs: `https://your-domain.com`
   - Allowed Web Origins: `https://your-domain.com`

2. **Set environment variables in Vercel:**
   ```
   VITE_AUTH0_DOMAIN=dev-xxxxxxxx.us.auth0.com
   VITE_AUTH0_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
   ```

3. **Redeploy application**

## Things NOT to Do (Critical)

❌ **Don't store tokens in localStorage manually**
```typescript
// NEVER DO THIS
localStorage.setItem('token', accessToken);
```

❌ **Don't hardcode domain or clientId**
```typescript
// NEVER DO THIS
const domain = "dev-xyz123.us.auth0.com";
```

❌ **Don't skip Web Origins**
- Silent auth will break
- Users forced to re-login on every page refresh

❌ **Don't mix Auth0 with custom auth logic**
- Use one or the other
- ARES supports both via fallback mechanism

❌ **Don't use a Regular Web App client for the SPA flow**
- Breaks SPA PKCE token flow (no client secret in browser)
- Use "Single Page Application" for `VITE_AUTH0_*` SPA auth, or "Regular Web Application" only for the server-side `/api/auth/login?provider=auth0` & `/api/auth/callback?provider=auth0` flow

## Security Best Practices

✅ **Tokens in memory** (not localStorage)
✅ **Just-in-time token access** via `getAccessToken()`
✅ **Silent authentication** via refresh tokens
✅ **Automatic token rotation** by Auth0
✅ **XSS-resistant** architecture

## Need Help?

- [Auth0 React SDK Docs](https://auth0.com/docs/libraries/auth0-react)
- [Auth0 SPA Quickstart](https://auth0.com/docs/quickstart/spa/react)
- [ARES Token Management Guide](./SECURE_TOKEN_MANAGEMENT.md)

---

**Remember:** You're building infrastructure first. Get Auth0 working properly before adding complexity.
