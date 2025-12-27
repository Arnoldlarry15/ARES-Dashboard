# AI Backend Migration - Deployment Instructions

## 🎯 What Changed

The AI calls have been moved from the frontend to a secure backend serverless function. This ensures your Gemini API key is **never exposed** to the client browser.

### Before (Insecure ❌)
- API key was in frontend environment variables (`VITE_GEMINI_API_KEY`)
- API key was exposed in browser JavaScript bundle
- Anyone could inspect network traffic to see your key

### After (Secure ✅)
- API key is stored in Vercel backend environment variables
- API calls are made through serverless function at `/api/generate-tactic`
- API key never leaves the server
- Frontend calls the backend API endpoint

## 📁 Files Changed

### New Files Created
- **`/api/generate-tactic.ts`** - Serverless function that handles AI requests
- **`/api/tsconfig.json`** - TypeScript configuration for API functions

### Modified Files
- **`services/geminiService.ts`** - Now calls backend API instead of direct Gemini
- **`vercel.json`** - Added API routes configuration
- **`package.json`** - Added `@vercel/node` dependency
- **`.env.example`** - Updated to show new environment variable structure
- **`DEPLOY.md`** - Updated deployment instructions
- **`VERCEL_DEPLOYMENT.md`** - Updated environment variable instructions

## 🚀 What You Need to Do

### Step 1: Update Environment Variables in Vercel

1. Go to your Vercel dashboard: https://vercel.com/dashboard
2. Select your ARES-Dashboard project
3. Go to **Settings** → **Environment Variables**
4. **Delete** the old variable if it exists:
   - `VITE_GEMINI_API_KEY` ❌ (old, delete this)
5. **Add** the new variable:
   - **Key:** `GEMINI_API_KEY` ✅ (new, add this)
   - **Value:** Your Google Gemini API key
   - **Environments:** Select all (Production, Preview, Development)
6. Click **Save**

### Step 2: Redeploy Your Application

After updating the environment variables, you need to trigger a new deployment:

**Option A: Automatic Deployment**
- Push this branch to GitHub
- Merge the PR
- Vercel will automatically deploy

**Option B: Manual Deployment**
1. In your Vercel dashboard
2. Go to **Deployments** tab
3. Click the "..." menu on the latest deployment
4. Click **Redeploy**

### Step 3: Verify the Deployment

1. Visit your deployed application URL
2. Try selecting a tactic to generate payload details
3. Check that AI generation is working (or fallback to mock data if no API key)
4. Open browser DevTools → Network tab
5. Confirm you see a call to `/api/generate-tactic` (not direct Gemini API calls)

## 🔧 Local Development

If you want to test locally with Vercel CLI:

```bash
# Install Vercel CLI (if not already installed)
npm i -g vercel

# Create a .env.local file (DO NOT commit this)
echo "GEMINI_API_KEY=your_api_key_here" > .env.local

# Run the development server with Vercel
vercel dev
```

This will run both your frontend and the serverless function locally at `http://localhost:3000`.

## 🔐 Security Improvements

1. **API Key Protection**: Your Gemini API key is now only accessible on the backend
2. **No Client Exposure**: The key never appears in JavaScript bundles or browser requests
3. **Environment Isolation**: Uses separate environment variables for frontend and backend
4. **Request Validation**: Backend validates all incoming requests before processing

## 📊 How It Works

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────┐
│   Browser   │         │ Vercel Serverless│         │  Gemini API  │
│  (Frontend) │────────▶│    Function      │────────▶│   (Google)   │
│             │  POST   │ /api/generate-   │  API    │              │
│             │ request │    tactic        │  call   │              │
└─────────────┘         └──────────────────┘         └──────────────┘
                              ▲
                              │
                         GEMINI_API_KEY
                      (secure, server-only)
```

## 🧪 Testing Checklist

- [ ] Environment variable updated in Vercel (`GEMINI_API_KEY`)
- [ ] Old environment variable removed (`VITE_GEMINI_API_KEY`)
- [ ] Application redeployed
- [ ] Can access the application
- [ ] AI generation works (or mock data fallback)
- [ ] No console errors in browser
- [ ] API endpoint responding at `/api/generate-tactic`

## ❓ Troubleshooting

### "AI generation not working"
- Check that `GEMINI_API_KEY` is set in Vercel environment variables
- Ensure you redeployed after adding the variable
- Check Vercel function logs for errors

### "API endpoint not found"
- Verify `vercel.json` has the functions configuration
- Ensure the `/api` directory exists in your deployment
- Check Vercel deployment logs

### "Build fails"
- Run `npm install` to ensure all dependencies are installed
- Check that `@vercel/node` is in `package.json`
- Verify `npm run build` works locally

## 📞 Support

If you encounter any issues:
1. Check Vercel deployment logs
2. Check Vercel function logs (under Monitoring → Functions)
3. Review browser console for errors
4. Verify environment variables are correctly set

## ✨ Benefits

- ✅ **Secure**: API keys protected on the backend
- ✅ **Scalable**: Vercel serverless functions auto-scale
- ✅ **Fast**: Global edge deployment
- ✅ **Reliable**: Automatic fallback to mock data
- ✅ **Simple**: No infrastructure to manage

---

**You're all set!** The AI calls are now securely handled on the backend. 🎉
