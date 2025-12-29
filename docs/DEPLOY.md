# ARES Dashboard - Vercel Deployment Guide

## Quick Deploy to Vercel

### Option 1: One-Click Deploy (Recommended)
1. Fork this repository to your GitHub account
2. Visit [Vercel](https://vercel.com/new)
3. Import your forked repository
4. Configure environment variables (see below)
5. Click "Deploy"

### Option 2: Vercel CLI
```bash
# Install Vercel CLI globally
npm i -g vercel

# Navigate to project directory
cd ARES-Dashboard

# Deploy
vercel
```

## Environment Variables

Add these to your Vercel project settings (Settings → Environment Variables):

### Optional
- `GEMINI_API_KEY` - Your Google Gemini API key (for AI-powered payload generation)
  - If not provided, the app will use static fallback data for testing
  - **Important**: Use `GEMINI_API_KEY` (NOT `VITE_GEMINI_API_KEY`) - the API key is now secured in the backend

### How to Add Environment Variables in Vercel
1. Go to your project in Vercel dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add `GEMINI_API_KEY` with your API key value
4. Select all environments (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your project for changes to take effect

## Build Configuration

The application uses the following build settings (configured in `vercel.json`):

- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

## Post-Deployment

### Access Your Dashboard
After deployment, Vercel will provide you with:
- **Production URL**: `https://your-project.vercel.app`
- **Preview URLs**: Generated for each PR/branch

### Verify Deployment
1. Visit your production URL
2. Test login with different roles (Admin, Red Team Lead, Analyst, Viewer)
3. Try creating and saving campaigns
4. Test theme toggle (dark/light mode)
5. Verify keyboard shortcuts (press `?` to see all shortcuts)

### Custom Domain (Optional)
1. Go to your Vercel project settings
2. Navigate to **Domains**
3. Add your custom domain
4. Follow DNS configuration instructions

## Security Recommendations

### Security Recommendations

### For Production Use
1. **Enable Authentication**: The dashboard includes demo RBAC - integrate with your auth provider
2. **Set Environment Variables**: Add your Gemini API key (`GEMINI_API_KEY`) in Vercel settings
   - The API key is now secured in the backend (not exposed to the frontend)
3. **Enable HTTPS**: Vercel provides this by default
4. **Review Access**: Use Vercel's team/access controls for multi-user management

### Security Headers
The `vercel.json` configures these security headers automatically:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

## Monitoring & Analytics

Vercel provides built-in:
- **Analytics**: Page views, user metrics
- **Speed Insights**: Core Web Vitals
- **Logs**: Real-time function logs
- **Previews**: Automatic preview deployments for PRs

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Verify Node.js version compatibility (20.x required)
- Review build logs in Vercel dashboard

### Blank White Page in Production
- Check browser console for JavaScript errors
- Verify the build output contains index.html in the `dist` directory
- Ensure vite.config.ts has `base: '/'` set correctly
- Verify SPA routing is configured in vercel.json with proper rewrites
- Check that all assets are properly referenced with absolute paths

### Environment Variables Not Working
- Ensure variable names are correct (no `VITE_` prefix for backend variables)
- Redeploy after adding environment variables
- Check that variables are set for correct environments

### 404 Errors
- Verify `vercel.json` rewrites configuration
- Ensure SPA routing is properly configured

## Support

For issues or questions:
- Check [Vercel Documentation](https://vercel.com/docs)
- Review project README.md
- Open an issue on GitHub

## Features Available

✅ Complete OWASP LLM Top 10, MITRE ATLAS, MITRE ATT&CK frameworks
✅ Campaign management with save/load/delete
✅ Enterprise authentication & RBAC
✅ Team workspaces & collaboration
✅ Dark/light theme toggle
✅ Keyboard shortcuts
✅ Audit logging
✅ Payload customization editor
✅ Progress persistence

Enjoy your ARES Dashboard deployment! 🚀
