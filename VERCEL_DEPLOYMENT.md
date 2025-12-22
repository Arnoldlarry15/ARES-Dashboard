# Quick Vercel Deployment Guide

This project is **ready to deploy** to Vercel! Follow these simple steps:

## 🚀 Deploy Now (3 Steps)

### Option 1: One-Click Deploy (Fastest)

1. **Click the Deploy Button:**
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Arnoldlarry15/ARES-Dashboard)

2. **Sign in to Vercel** (free account - no credit card required)

3. **Click "Deploy"** and you're done! 🎉

Your app will be live at: `https://your-project-name.vercel.app`

### Option 2: Import from GitHub

1. Go to [vercel.com/new](https://vercel.com/new)
2. Sign in with your GitHub account
3. Import the repository: `Arnoldlarry15/ARES-Dashboard`
4. Click "Deploy" (no configuration needed!)

### Option 3: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from your local repository
cd ARES-Dashboard
vercel
```

## 🔑 Environment Variables (Optional)

The app works perfectly **without any environment variables** using mock data.

If you want AI-powered payload generation, add this in Vercel:

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** Your Google Gemini API key (get it from https://aistudio.google.com/apikey)
   - **Environments:** Select all (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your project for changes to take effect

**Important Security Note:** The API key is now secured in the backend serverless function and is NOT exposed to the frontend. Use `GEMINI_API_KEY` (without the `VITE_` prefix).

## ✅ What's Already Configured

This repository includes:

- ✅ `vercel.json` - Optimized Vercel configuration
- ✅ `.vercelignore` - Excludes unnecessary files
- ✅ `vite.config.ts` - Proper build configuration
- ✅ Security headers configured
- ✅ SPA routing configured

**Build Settings (Automatically Detected):**
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## 🎯 Post-Deployment

After deployment completes:

1. **Visit your app:** Vercel provides the URL in the deployment summary
2. **Test login:** Try different user roles (Admin, Red Team Lead, Analyst, Viewer)
3. **Create a campaign:** Build an attack manifest and export as JSON
4. **Toggle theme:** Switch between dark/light mode

## 🔧 Advanced Configuration

### Custom Domain

1. Go to your Vercel project
2. Navigate to **Settings** → **Domains**
3. Add your domain and follow DNS instructions

### Performance Monitoring

Vercel provides free built-in monitoring:
- **Analytics** - Page views, user metrics
- **Speed Insights** - Core Web Vitals
- **Logs** - Real-time application logs

## 📝 Notes

- **No credit card required** for free tier
- **Automatic HTTPS** enabled by default
- **Preview deployments** created for each PR
- **Zero-downtime deployments**
- **Global CDN** distribution

## 🆘 Troubleshooting

**Build fails?**
- Check the build logs in Vercel Dashboard
- Ensure Node.js 18.x is being used

**Environment variables not working?**
- Make sure variable name is `GEMINI_API_KEY` (without `VITE_` prefix)
- The API key is now used by the backend serverless function
- Redeploy after adding variables

**404 errors?**
- The `vercel.json` already configures SPA routing
- Should work out of the box

## 📚 More Information

For comprehensive deployment documentation, see [DEPLOY.md](DEPLOY.md)

---

**That's it! Your ARES Dashboard is now live on Vercel! 🚀**
