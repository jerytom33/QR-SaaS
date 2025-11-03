# Vercel Deployment Guide for QR SaaS

## Prerequisites

1. **Vercel Account**: Sign up at https://vercel.com
2. **GitHub Repository**: Your code is already pushed to https://github.com/jerytom33/QR-SaaS
3. **Neon Database**: Your PostgreSQL database is ready

## Step 1: Import Project to Vercel

1. Go to https://vercel.com/new
2. Select "Import Git Repository"
3. Choose your GitHub account and select `jerytom33/QR-SaaS`
4. Click "Import"

## Step 2: Configure Environment Variables

In Vercel project settings, add these environment variables:

### Required Variables (Set these first!)

```bash
# Database
DATABASE_URL=postgresql://neondb_owner:npg_AgQvF5s9dmGj@ep-wispy-sound-ahxwwim6-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

# Security - Generate new values!
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
JWT_SECRET=<generate with: openssl rand -base64 32>

# URLs - Update after first deployment
NEXTAUTH_URL=https://your-app.vercel.app
CORS_ORIGIN=https://your-app.vercel.app
```

### Optional Variables (Use defaults or customize)

```bash
NODE_ENV=production
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

## Step 3: Deploy

1. Click "Deploy" in Vercel
2. Wait for the build to complete (3-5 minutes)
3. Once deployed, copy your production URL (e.g., `https://qr-saas.vercel.app`)

## Step 4: Update Environment Variables

Go back to Vercel Settings > Environment Variables and update:

```bash
NEXTAUTH_URL=https://your-actual-domain.vercel.app
CORS_ORIGIN=https://your-actual-domain.vercel.app
```

Then redeploy:
- Go to Deployments tab
- Click "..." on the latest deployment
- Select "Redeploy"

## Step 5: Run Database Migrations

After first deployment, you need to set up the database:

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link to your project
vercel link

# Run migrations
vercel env pull .env.production
npx prisma migrate deploy
npx prisma db seed
```

Or use Neon's SQL Editor to run migrations directly.

## Important Vercel Limitations

### ⚠️ Features That Won't Work on Vercel:

1. **Socket.IO / WebSockets**
   - Custom server (`server.ts`) is not used
   - Real-time features need alternatives:
     - Pusher: https://pusher.com
     - Ably: https://ably.com
     - Supabase Realtime: https://supabase.com/realtime

2. **File Uploads**
   - Vercel filesystem is ephemeral (resets on each deployment)
   - Use cloud storage:
     - Vercel Blob: https://vercel.com/docs/storage/vercel-blob
     - AWS S3: https://aws.amazon.com/s3/
     - Cloudflare R2: https://www.cloudflare.com/products/r2/

3. **Baileys WhatsApp Auth State**
   - `.wa-auth` directory won't persist
   - Solutions:
     - Store auth state in PostgreSQL
     - Use external storage (S3/R2)
     - Accept that QR sessions need re-authentication

4. **Long-Running Processes**
   - Max execution time: 10s (Hobby), 60s (Pro)
   - SSE streams work but are time-limited
   - Use Vercel Cron Jobs for scheduled tasks

## Verification Checklist

After deployment, test these endpoints:

- [ ] `GET /` - Homepage loads
- [ ] `GET /api/health` - Health check returns OK
- [ ] `POST /api/auth/demo-login` - Demo login works
- [ ] `POST /api/v1/auth/qr-session/generate` - QR generation works
- [ ] `GET /api/v1/auth/qr-session/status/[id]` - Status check works

## Troubleshooting

### Build Fails

1. Check build logs in Vercel dashboard
2. Ensure all environment variables are set
3. Verify DATABASE_URL is correct
4. Check Prisma schema matches database

### Runtime Errors

1. Check Function Logs in Vercel dashboard
2. Verify environment variables in production
3. Check database connection
4. Look for missing dependencies

### Database Connection Issues

1. Ensure DATABASE_URL includes `?sslmode=require`
2. Check Neon project is not paused
3. Verify connection pooling is enabled
4. Use Neon connection pooler endpoint (not direct)

## Custom Domain (Optional)

1. Go to Settings > Domains
2. Add your custom domain
3. Update DNS records as instructed
4. Update environment variables with new domain

## Monitoring & Logs

- **Function Logs**: Vercel Dashboard > Logs
- **Analytics**: Vercel Dashboard > Analytics
- **Error Tracking**: Consider integrating Sentry

## Cost Estimation

- **Vercel Hobby**: Free (includes 100GB bandwidth, 100 hours compute)
- **Vercel Pro**: $20/month (includes 1TB bandwidth, 1000 hours compute)
- **Neon Free**: Included PostgreSQL
- **Recommended**: Start with Hobby, upgrade to Pro if needed

## Next Steps

1. Set up custom domain
2. Configure monitoring (Sentry, LogRocket)
3. Set up cloud file storage
4. Implement real-time alternative to Socket.IO
5. Add automated database backups
6. Set up CI/CD with GitHub Actions

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
- GitHub Issues: https://github.com/jerytom33/QR-SaaS/issues
