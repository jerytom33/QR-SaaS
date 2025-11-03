# Vercel Deployment - Complete Setup Guide

## ✅ All Vercel Limitations Resolved

This guide covers the deployment of a fully Vercel-compatible version of QR SaaS with all serverless limitations addressed:

1. ✅ **Socket.IO replaced with Pusher** (real-time events)
2. ✅ **File storage moved to Vercel Blob** (cloud storage)
3. ✅ **Baileys auth state stored in PostgreSQL** (database persistence)

---

## Prerequisites

1. **Vercel Account**: https://vercel.com
2. **GitHub Repository**: https://github.com/jerytom33/QR-SaaS
3. **Neon PostgreSQL**: Your connection string ready
4. **Pusher Account**: https://dashboard.pusher.com (free tier available)

---

## Step 1: Set Up Pusher (Real-time Features)

1. Go to https://dashboard.pusher.com
2. Create a new app:
   - Name: `qr-saas-prod`
   - Cluster: Choose closest to your users (e.g., `us2`)
   - Tech stack: Select "React" and "Node.js"
3. Go to "App Keys" tab and copy:
   - `app_id`
   - `key` 
   - `secret`
   - `cluster`

---

## Step 2: Enable Vercel Blob Storage

1. Go to your Vercel dashboard
2. Select your project (or create it first)
3. Go to "Storage" tab
4. Click "Create Database"
5. Select "Blob"
6. Name it `qr-saas-files`
7. Click "Create"

Vercel will automatically set `BLOB_READ_WRITE_TOKEN` for you.

---

## Step 3: Import Project to Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select `jerytom33/QR-SaaS`
4. **Don't deploy yet** - click "Configure Project" first

---

## Step 4: Configure Environment Variables

Add these in Vercel project settings (Settings > Environment Variables):

### 🔴 Required - Core

```bash
NODE_ENV=production
DATABASE_URL=postgresql://neondb_owner:npg_AgQvF5s9dmGj@ep-wispy-sound-ahxwwim6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### 🔴 Required - Security (Generate new values!)

```bash
# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=<your-generated-secret-here>
JWT_SECRET=<your-generated-secret-here>
```

### 🔴 Required - Pusher (From Step 1)

```bash
PUSHER_APP_ID=<your-app-id>
NEXT_PUBLIC_PUSHER_KEY=<your-key>
PUSHER_SECRET=<your-secret>
NEXT_PUBLIC_PUSHER_CLUSTER=us2
```

### 🔴 Required - URLs (Update after first deployment)

```bash
# Temporary values - update after deployment
NEXTAUTH_URL=https://qr-saas.vercel.app
CORS_ORIGIN=https://qr-saas.vercel.app
```

### ⚪ Optional - Defaults

```bash
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
QR_SESSION_EXPIRES_IN=5m
QR_CODE_SIZE=256
WA_QR_PROVIDER=baileys
WA_QR_TIMEOUT_MS=15000
API_RATE_LIMIT=100
API_RATE_LIMIT_WINDOW=900000
LOG_LEVEL=info
LOG_FORMAT=json
RATE_LIMIT_STRICT=false
ENABLE_ANALYTICS=true
ENABLE_MONITORING=false
ENABLE_CACHE=true
DEFAULT_TENANT_PLAN=FREE
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
SESSION_MAX_AGE=604800
SESSION_UPDATE_AGE=86400
```

**Note**: `BLOB_READ_WRITE_TOKEN` is automatically set by Vercel Blob Storage.

---

## Step 5: First Deployment

1. Click "Deploy" in Vercel
2. Wait 3-5 minutes for build to complete
3. Copy your production URL (e.g., `https://qr-saas-xyz123.vercel.app`)

---

## Step 6: Update URLs

1. Go to Vercel Settings > Environment Variables
2. Update these two variables with your actual URL:
   ```bash
   NEXTAUTH_URL=https://qr-saas-xyz123.vercel.app
   CORS_ORIGIN=https://qr-saas-xyz123.vercel.app
   ```
3. Go to Deployments tab
4. Click "..." on latest deployment
5. Select "Redeploy" → "Use existing Build Cache"

---

## Step 7: Database Setup

The database schema is already synced, but you may want to seed demo data:

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Link to your project
vercel link

# Pull production environment variables
vercel env pull .env.production

# Optional: Seed demo accounts
npx prisma db seed
```

---

## ✨ What Changed to Fix Vercel Limitations

### 1. Real-time Features (Socket.IO → Pusher)

**Before**: Custom server with Socket.IO (not supported on Vercel)  
**After**: Pusher Channels for serverless real-time

- Created `/src/lib/pusher/server.ts` - Server-side Pusher client
- Created `/src/lib/pusher/client.ts` - Browser Pusher client  
- Added `/api/pusher/auth` - Channel authentication endpoint
- Updated QR stream route to trigger Pusher events

**How it works**:
- SSE streams still work for QR rotation
- Pusher events provide alternative real-time path
- Both methods coexist for maximum compatibility

### 2. File Storage (Filesystem → Vercel Blob)

**Before**: Files saved to `./uploads` directory (ephemeral on Vercel)  
**After**: Vercel Blob Storage (persistent cloud storage)

- Created `/src/lib/storage/blob.ts` - Blob storage utilities
- Auto-detects environment (filesystem in dev, Blob in production)
- Functions: `uploadToBlob`, `deleteFromBlob`, `listBlobFiles`, `getBlobMetadata`

**How it works**:
- In development: Uses local filesystem
- In production: Automatically uses Vercel Blob
- No code changes needed between environments

### 3. Baileys Auth (Filesystem → Database)

**Before**: Auth state in `.wa-auth/` directory (doesn't persist on Vercel)  
**After**: PostgreSQL storage via Prisma

- Added `BaileysAuthState` model to Prisma schema
- Created `/src/lib/qr/providers/baileys-db-auth.ts` - Database auth state handler
- Updated Baileys provider to use `useDatabaseAuthState()` instead of `useMultiFileAuthState()`

**How it works**:
- All WhatsApp authentication data stored in `baileys_auth_states` table
- Survives deployments and scales across serverless functions
- Each QR session has isolated auth state

---

## Verification Checklist

After deployment, test these features:

- [ ] Homepage loads correctly
- [ ] Demo login works (`/api/auth/demo-login`)
- [ ] QR code generation works
- [ ] QR code rotates in real-time (Pusher events)
- [ ] WhatsApp scanning completes authentication
- [ ] Files can be uploaded (uses Vercel Blob)
- [ ] Real-time notifications work (Pusher)

---

## Monitoring & Debugging

### View Logs
- Go to Vercel Dashboard > Your Project > Logs
- Filter by "Error" to see only errors
- Use "Function Logs" for specific route debugging

### Check Pusher Events
- Go to https://dashboard.pusher.com
- Select your app
- Go to "Debug Console"
- Watch events being triggered in real-time

### Check Database
- Go to Neon dashboard
- Check `baileys_auth_states` table for auth data
- Monitor active connections

### Common Issues

**Pusher not working**:
- Verify all 4 Pusher environment variables are set
- Check Pusher app is not paused
- Ensure cluster matches (e.g., `us2`)

**File uploads failing**:
- Ensure Vercel Blob is enabled in project
- Check `BLOB_READ_WRITE_TOKEN` is set
- Verify file size is within limits

**WhatsApp QR not completing**:
- Check `baileys_auth_states` table has entries
- Verify database connection is stable
- Ensure SSE stream stays open (60s timeout)

---

## Cost Estimation

### Vercel
- **Hobby**: Free (100GB bandwidth, 100 hours compute)
- **Pro**: $20/month (1TB bandwidth, 1000 hours compute)

### Pusher
- **Free**: 200k messages/day, 100 max connections
- **Startup**: $29/month (1M messages/day, unlimited connections)

### Vercel Blob
- **Included**: 500GB storage + 1TB bandwidth on Pro plan
- **Additional**: $0.15/GB storage, $0.10/GB bandwidth

### Neon PostgreSQL
- **Free**: 512MB storage, 0.5GB data transfer
- **Pro**: Starting at $19/month

**Recommendation**: Start with free tiers, upgrade as needed.

---

## Production Optimizations

### 1. Custom Domain
- Go to Settings > Domains
- Add your custom domain
- Update `NEXTAUTH_URL` and `CORS_ORIGIN`

### 2. Edge Runtime (Optional)
- Some API routes can use Edge runtime for faster cold starts
- Update route with: `export const runtime = 'edge'`
- Note: Not compatible with Prisma (use for non-database routes)

### 3. Caching
- Enable Vercel's built-in caching
- Add `Cache-Control` headers to static assets
- Use Vercel Edge Config for frequently accessed data

### 4. Monitoring
- Set up Sentry for error tracking
- Enable Vercel Analytics
- Add custom logging with Logtail or Axiom

---

## Backup & Recovery

### Database Backups
```bash
# Export data
npx prisma db pull
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > backup.sql
```

### Vercel Blob Backups
- Blobs are automatically replicated
- Use `listBlobFiles()` to enumerate all files
- Download programmatically for off-site backup

---

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Pusher Docs**: https://pusher.com/docs
- **Prisma Docs**: https://www.prisma.io/docs
- **GitHub Issues**: https://github.com/jerytom33/QR-SaaS/issues

---

## Next Steps

1. ✅ Deploy to Vercel
2. ⚙️ Configure custom domain
3. 📊 Set up monitoring (Sentry, Analytics)
4. 🔐 Enable 2FA for production accounts
5. 📧 Configure email notifications
6. 🎨 Customize branding and theme
7. 📱 Test on mobile devices
8. 🚀 Launch!
