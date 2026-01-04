# Auth0 Quick Reference Card

## ✅ What's Already Done

- ✅ Auth0 React SDK installed
- ✅ `Auth0Provider` wrapper configured in `index.tsx`
- ✅ `useAuthManager` hook created for unified auth
- ✅ Login/Logout buttons in `AuthLogin` component
- ✅ Memory-based token storage (no localStorage)
- ✅ Silent authentication enabled

## 🚀 Quick Setup (5 Minutes)

### 1. Create Auth0 Application

- Go to [Auth0 Dashboard](https://manage.auth0.com)
- Create **Single Page Application** (NOT Regular Web App)
- Name: `ARES Dashboard`

### 2. Configure URLs

Add to your Auth0 application settings:

```
Allowed Callback URLs:    http://localhost:5173
Allowed Logout URLs:      http://localhost:5173
Allowed Web Origins:      http://localhost:5173
```

⚠️ **Don't skip Web Origins** - breaks silent auth!

### 3. Add .env.local

Create `.env.local` in project root:

```bash
VITE_AUTH0_DOMAIN=dev-xxxxxxxx.us.auth0.com
VITE_AUTH0_CLIENT_ID=your_client_id_here
```

### 4. Restart Dev Server

```bash
npm run dev
```

### 5. Test

- Visit http://localhost:5173
- Click "Sign In with Auth0"
- Should redirect to Auth0 login
- After login, redirected back to dashboard

## 📝 Using Auth in Code

```typescript
import { useAuthManager } from './hooks/useAuthManager';

function MyComponent() {
  const { 
    isAuthenticated, 
    user, 
    loginWithAuth0, 
    logout,
    getAccessToken  // For API calls
  } = useAuthManager();

  // Get token when calling APIs
  const callAPI = async () => {
    const token = await getAccessToken();
    fetch('/api/data', {
      headers: { Authorization: `Bearer ${token}` }
    });
  };
}
```

## 🔒 Security Rules

### ✅ DO

- ✅ Use `getAccessToken()` when calling APIs
- ✅ Access tokens just-in-time
- ✅ Use `useAuthManager` hook
- ✅ Trust Auth0 SDK for token management

### ❌ DON'T

- ❌ Store tokens in localStorage manually
- ❌ Hardcode Auth0 credentials
- ❌ Skip Web Origins configuration
- ❌ Use "Regular Web App" type
- ❌ Mix Auth0 with custom auth (yet)

## 🐛 Troubleshooting

### "Auth0 is not configured"

```bash
# Check environment variables
cat .env.local

# Should see VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID
# Restart dev server
npm run dev
```

### Redirect Loop

1. Verify Allowed Callback URLs in Auth0
2. Clear browser cache/cookies
3. Try incognito mode

### Silent Auth Fails (Re-login on refresh)

1. Check **Allowed Web Origins** is set
2. Verify `useRefreshTokens: true` in config
3. Wait ~1 min after saving Auth0 settings

### CORS Errors

Add `http://localhost:5173` to **Allowed Web Origins**

## 📚 Full Documentation

- [Complete Setup Guide](./AUTH0_SETUP_GUIDE.md)
- [Security Best Practices](./SECURE_TOKEN_MANAGEMENT.md)
- [Auth0 React Docs](https://auth0.com/docs/libraries/auth0-react)

## 🚢 Production Checklist

Before deploying:

- [ ] Add production URL to Auth0 Allowed Callbacks
- [ ] Add production URL to Auth0 Allowed Logouts  
- [ ] Add production URL to Auth0 Allowed Web Origins
- [ ] Set `VITE_AUTH0_DOMAIN` in Vercel
- [ ] Set `VITE_AUTH0_CLIENT_ID` in Vercel
- [ ] Test login flow in production

---

**Need help?** See [AUTH0_SETUP_GUIDE.md](./AUTH0_SETUP_GUIDE.md) for detailed instructions.
