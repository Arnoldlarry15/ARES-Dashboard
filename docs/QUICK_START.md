# Quick Reference: AI Backend Migration

## 🚀 Quick Start (3 Steps)

### Step 1: Update Environment Variable in Vercel
1. Go to https://vercel.com/dashboard
2. Select ARES-Dashboard project
3. Settings → Environment Variables
4. **DELETE**: `VITE_GEMINI_API_KEY`
5. **ADD**: `GEMINI_API_KEY` = your_api_key_here
6. Select all environments (Production, Preview, Development)
7. Click Save

### Step 2: Redeploy
- Merge this PR, OR
- In Vercel: Deployments → ... → Redeploy

### Step 3: Verify
- Visit your app
- Test tactic generation
- Check Network tab for `/api/generate-tactic` calls

---

## 📊 What Changed

```diff
- Frontend directly calls Gemini API (insecure)
+ Frontend → Backend API → Gemini API (secure)

- VITE_GEMINI_API_KEY (exposed to browser)
+ GEMINI_API_KEY (backend only, secure)
```

---

## 🔍 Quick Test

1. Open browser DevTools (F12)
2. Go to Network tab
3. Select a tactic in the app
4. Look for POST request to `/api/generate-tactic`
5. ✅ If you see it, migration successful!

---

## 📖 Need More Details?

- **Complete Guide**: Read `BACKEND_MIGRATION.md`
- **Deployment Docs**: Read `DEPLOY.md`
- **Main Documentation**: See `../README.md`

---

## ❓ Troubleshooting

**"AI not working"**
→ Check `GEMINI_API_KEY` is set in Vercel and redeployed

**"404 on /api/generate-tactic"**
→ Ensure `/api` folder is in deployment, check Vercel logs

**"Build failed"**
→ Run `npm install` then `npm run build` locally

---

## ✅ Success Checklist

- [ ] Environment variable updated (`GEMINI_API_KEY`)
- [ ] Old variable removed (`VITE_GEMINI_API_KEY`)
- [ ] Application redeployed
- [ ] App loads without errors
- [ ] Tactic generation works
- [ ] Network tab shows `/api/generate-tactic` calls

---

**That's it! Your API is now secure. 🎉**
