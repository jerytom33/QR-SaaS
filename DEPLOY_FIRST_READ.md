⚠️ **IMPORTANT: Set Environment Variables Before First Deployment** ⚠️

The deployment will FAIL without these environment variables. Set them up first!

## Quick Setup via Vercel Dashboard (Recommended)

1. Go to https://vercel.com/new
2. Import `jerytom33/QR-SaaS` repository
3. **BEFORE clicking Deploy**, go to "Environment Variables" section
4. Add these variables:

### 🔴 REQUIRED - Will fail without these:

```
DATABASE_URL=postgresql://neondb_owner:npg_AgQvF5s9dmGj@ep-wispy-sound-ahxwwim6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

NEXTAUTH_SECRET=<run: openssl rand -base64 32>
JWT_SECRET=<run: openssl rand -base64 32>

NEXTAUTH_URL=https://your-app.vercel.app
CORS_ORIGIN=https://your-app.vercel.app

# Get from https://dashboard.pusher.com
PUSHER_APP_ID=
NEXT_PUBLIC_PUSHER_KEY=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_CLUSTER=us2
```

5. Click "Deploy"
6. After deployment, update `NEXTAUTH_URL` and `CORS_ORIGIN` with your actual Vercel URL
7. Redeploy

## Alternative: Set via Vercel CLI

Run these commands BEFORE deploying:

```bash
# Core
vercel env add DATABASE_URL production
vercel env add NEXTAUTH_SECRET production
vercel env add JWT_SECRET production
vercel env add NEXTAUTH_URL production
vercel env add CORS_ORIGIN production

# Pusher
vercel env add PUSHER_APP_ID production
vercel env add NEXT_PUBLIC_PUSHER_KEY production
vercel env add PUSHER_SECRET production
vercel env add NEXT_PUBLIC_PUSHER_CLUSTER production
```

Then deploy:
```bash
vercel --prod
```

## What You Need to Set Up First

### 1. Generate Secrets
```bash
openssl rand -base64 32  # Use for NEXTAUTH_SECRET
openssl rand -base64 32  # Use for JWT_SECRET
```

### 2. Create Pusher App
- Go to https://dashboard.pusher.com
- Create new app
- Copy: app_id, key, secret, cluster

### 3. Enable Vercel Blob
- After project creation, go to Storage tab
- Create Blob storage
- `BLOB_READ_WRITE_TOKEN` is auto-set

## Full Documentation

See `VERCEL_COMPLETE_SETUP.md` for complete step-by-step guide.
