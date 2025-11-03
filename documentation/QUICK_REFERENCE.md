# CRMFlow Quick Reference Guide

## 🚀 Quick Start

### Access the Application
```
http://localhost:3000
```

### Default Demo Accounts
```
Super Admin:              superadmin@demo.com
Tenant Admin (Demo):      admin@demo.com
User (Demo):              user@demo.com
Tenant Admin (Acme):      admin@acme-corp.com
```

---

## 📞 Quick API Reference

### Demo Login
```bash
POST /api/auth/demo-login
Content-Type: application/json

{"email": "superadmin@demo.com"}

# Response includes tokens:
{
  "tokens": {
    "accessToken": "jwt_token_here",
    "refreshToken": "long_lived_token"
  }
}
```

### Get Demo Accounts
```bash
GET /api/auth/demo-login

# Returns list of all demo accounts available
```

### Generate QR Session
```bash
POST /api/v1/auth/qr-session/generate
Authorization: Bearer YOUR_ACCESS_TOKEN

# Returns QR code and session info
```

### Check QR Status
```bash
GET /api/v1/auth/qr-session/status/SESSION_ID

# Returns current QR session status
```

### Health Check
```bash
GET /api/health

# Quick server status check
```

---

## 📁 Important Files

### Configuration
- `.env` - Environment variables
- `prisma/schema.prisma` - Database schema
- `tsconfig.json` - TypeScript configuration
- `next.config.ts` - Next.js configuration

### Core Application
- `src/app/page.tsx` - Homepage with demo login button
- `src/components/LoginModal.tsx` - Demo login UI
- `scripts/seed-demo-accounts.ts` - Database seeding

### API Implementation
- `src/app/api/auth/demo-login/route.ts` - Demo login endpoint
- `src/app/api/v1/auth/qr-session/generate/route.ts` - QR generation
- `src/app/api/v1/auth/qr-session/status/[qrSessionId]/route.ts` - QR status

### New Middleware
- `src/lib/middleware/auth.ts` - Authentication & RBAC
- `src/lib/middleware/validation.ts` - Request validation
- `src/lib/middleware/response.ts` - Response formatting
- `src/lib/audit.ts` - Audit logging

### Documentation
- `API_DOCUMENTATION.md` - Complete API reference
- `ITERATION_COMPLETE_SUMMARY.md` - Project summary
- `ITERATION_2_IMPROVEMENTS.md` - All improvements details
- `BUG_FIXES_SUMMARY.md` - Issues resolved
- `DEMO_LOGIN_IMPLEMENTATION.md` - Demo system details

---

## 🛠️ Common Commands

### Setup
```bash
npm install                  # Install dependencies
npm run db:push             # Push schema to database
npm run db:seed             # Seed demo accounts
```

### Development
```bash
npm run dev                 # Start dev server (port 3000)
npm run build               # Build for production
npm run lint                # Run ESLint
```

### Database
```bash
npm run db:migrate          # Create migrations
npm run db:reset            # Reset database
npx prisma studio          # Open database GUI
```

---

## 🔑 Environment Variables

```
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=file:./dev.db

# Authentication
JWT_SECRET=your-secret-key-must-be-32-chars
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# QR Auth
QR_SESSION_EXPIRES_IN=5m
QR_CODE_SIZE=256

# API
API_RATE_LIMIT=100
API_RATE_LIMIT_WINDOW=900000
```

### WhatsApp (Baileys) QR Provider

- Provider preference and settings:
  - `WA_QR_PROVIDER=baileys` (default) or `local` to force fallback
  - `WA_QR_TIMEOUT_MS=5000` wait time for Baileys QR before fallback
  - `WA_AUTH_DIR=./.wa-auth` directory for ephemeral Baileys auth state

The QR generation endpoint automatically tries Baileys first and falls back to the local JSON QR if Baileys is unavailable or times out. Response shape remains unchanged.

---

## 🔐 Security Headers

### In Requests
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

### In Responses
```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
```

---

## 📊 API Response Format

### Success (2xx)
```json
{
  "success": true,
  "data": { /* payload */ },
  "message": "Operation successful",
  "statusCode": 200,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

### Error (4xx, 5xx)
```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed message",
  "statusCode": 400,
  "timestamp": "2025-11-02T12:00:00.000Z"
}
```

---

## 🧪 Testing Quick Commands

```bash
# Test demo login
curl -X POST http://localhost:3000/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@demo.com"}'

# Test health check
curl http://localhost:3000/api/health

# Test with token
curl http://localhost:3000/api/v1/auth/qr-session/generate \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📈 Performance Tips

1. **Caching**: Responses cached in browser for up to 5 minutes
2. **Database**: Use pagination (max 100 items per page)
3. **QR Codes**: Sessions expire after 5 minutes (configurable)
4. **Rate Limiting**: 100 requests per 15 minutes per IP
5. **Tokens**: Access tokens valid for 15 minutes

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti :3000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :3000    # Windows
```

### Database Locked
```bash
# Reset database
rm dev.db
npm run db:push
npm run db:seed
```

### Token Expired
```bash
# Use refresh token to get new access token
# Or login again with demo account
```

### Validation Error
```bash
# Check request format matches documentation
# Verify all required fields are present
# Review error message for specific issues
```

---

## 📞 Key Endpoints Summary

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | /api/auth/demo-login | No | Login with demo account |
| GET | /api/auth/demo-login | No | List demo accounts |
| POST | /api/v1/auth/qr-session/generate | Yes | Create QR session |
| GET | /api/v1/auth/qr-session/status/:id | No | Check QR status |
| POST | /api/v1/auth/qr-session/scan | No | Mark QR as scanned |
| POST | /api/v1/auth/qr-session/link | No | Link device to QR |
| GET | /api/health | No | Health check |

---

## 🎓 Learn More

- **API Docs**: See `API_DOCUMENTATION.md` for complete reference
- **Architecture**: See `ITERATION_COMPLETE_SUMMARY.md` for technical details
- **Improvements**: See `ITERATION_2_IMPROVEMENTS.md` for all enhancements
- **Implementation**: See `DEMO_LOGIN_IMPLEMENTATION.md` for setup details
- **Fixes**: See `BUG_FIXES_SUMMARY.md` for issues resolved

---

## ✅ Checklist for Deployment

- [ ] All environment variables set
- [ ] Database seeded with demo accounts
- [ ] CORS configured if needed
- [ ] Rate limiting configured
- [ ] Monitoring setup (optional)
- [ ] Error tracking setup (optional)
- [ ] Backup strategy in place
- [ ] Load testing completed

---

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop (1920x1080+)
- Tablet (768x1024)
- Mobile (375x667+)

---

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

**Last Updated:** 2025-11-02  
**Version:** 1.0.0  
**Status:** Production Ready ✅

For detailed information, see the comprehensive documentation files.
