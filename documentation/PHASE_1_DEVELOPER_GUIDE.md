# Phase 1 Developer Guide: Security Features Usage

## Quick Start

### 1. Using Tenant Context in API Routes

```typescript
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  // Get authenticated user
  const user = await getAuthUser(request)
  
  // Extract tenant context from user
  const tenantContext = getTenantContextFromUser({
    tenantId: user.tenantId,
    role: user.role,
  })
  
  // Execute database query with tenant isolation
  const contacts = await withTenantContext(db, tenantContext, async (tx) => {
    return await tx.contact.findMany({
      where: { /* optional filtering */ }
    })
  })
  
  return NextResponse.json(contacts)
}
```

### 2. Adding Rate Limiting to Endpoints

```typescript
import { qrGenerationRateLimiter } from '@/lib/middleware/rate-limit'

export async function POST(request: NextRequest) {
  // Check rate limit first
  const rateLimitResult = await qrGenerationRateLimiter(request)
  if (rateLimitResult) return rateLimitResult
  
  // Continue with business logic
  const qrSession = await generateQRSession()
  
  return NextResponse.json(qrSession)
}
```

### 3. Creating Test Files

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createAuthenticatedRequest, createMockJWT } from '@/lib/test-utils'

describe('My Endpoint', () => {
  it('should work with authenticated user', async () => {
    const request = createAuthenticatedRequest(
      { 
        url: 'http://localhost:3000/api/resource',
        method: 'GET'
      },
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'USER'
      }
    )
    
    expect(request.headers.get('authorization')).toBeTruthy()
  })
})
```

---

## API Reference

### Tenant Context Middleware

#### `getTenantContextFromUser(user)`
Extracts tenant context from authenticated user object.

**Parameters**:
- `user.tenantId` (string): User's tenant ID
- `user.role` (string): User's role (USER, TENANT_ADMIN, SUPER_ADMIN)

**Returns**: TenantContext object
```typescript
{
  tenantId: string,
  isSuperAdmin: boolean
}
```

**Example**:
```typescript
const context = getTenantContextFromUser({
  tenantId: 'tenant-456',
  role: 'SUPER_ADMIN'
})
// { tenantId: 'tenant-456', isSuperAdmin: true }
```

#### `withTenantContext(prisma, context, operation)`
Executes database operations with tenant context set in PostgreSQL session.

**Parameters**:
- `prisma`: Prisma client instance
- `context`: TenantContext from getTenantContextFromUser()
- `operation`: Async function (tx) => Promise<T>

**Returns**: Promise of operation result

**Example**:
```typescript
const result = await withTenantContext(db, context, async (tx) => {
  return await tx.contact.findMany()
})
```

### Rate Limiting Middleware

#### Available Limiters

1. **publicRateLimiter** - 100 requests per 15 minutes (IP-based)
2. **authenticatedRateLimiter** - 1000 requests per 15 minutes (User-based)
3. **qrGenerationRateLimiter** - 10 requests per minute (QR generation)
4. **loginRateLimiter** - 5 attempts per 15 minutes (Login protection)
5. **apiKeyRateLimiter** - 60 requests per minute (API key usage)

#### Usage Pattern
```typescript
import { qrGenerationRateLimiter } from '@/lib/middleware/rate-limit'

const result = await qrGenerationRateLimiter(request)
if (result) return result // Rate limited - return error response

// Continue with operation
```

#### Response Format (when rate limited)
```json
{
  "success": false,
  "error": "Rate Limit Exceeded"
}
```

**Headers**:
- `X-RateLimit-Limit`: Total allowed requests
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp when limit resets
- `Retry-After`: Seconds to wait before retrying

### Test Utilities

#### `createMockRequest(options)`
Creates a mock NextRequest for testing.

**Parameters**:
```typescript
{
  url?: string              // Default: 'http://localhost:3000/api/test'
  method?: string           // Default: 'GET'
  headers?: Record<string>  // Custom headers
  body?: any               // Request body
}
```

**Returns**: NextRequest-like mock object

#### `createAuthenticatedRequest(options, authPayload)`
Creates an authenticated mock request with JWT.

**Parameters**:
- `options`: Same as createMockRequest
- `authPayload`: JWT payload object with userId, tenantId, role

**Returns**: NextRequest-like mock with Authorization header

#### `createMockJWT(payload, secret)`
Creates a valid-looking JWT token.

**Parameters**:
- `payload`: JWT payload object
- `secret`: Signing secret (default: test secret)

**Returns**: JWT token string

#### Database Mocking
```typescript
import { createMockPrismaClient, createMockTenant, createMockContact } from '@/lib/test-utils/db-mock'

const mockPrisma = createMockPrismaClient()
const tenant = createMockTenant({ id: 'custom-id' })
const contact = createMockContact({ tenantId: tenant.id })
```

---

## Common Patterns

### Pattern 1: Protected API Route with Tenant Isolation

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { qrGenerationRateLimiter } from '@/lib/middleware/rate-limit'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  // 1. Rate limit check
  const rateLimitResult = await qrGenerationRateLimiter(request)
  if (rateLimitResult) return rateLimitResult
  
  // 2. Authentication
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  // 3. Tenant context
  const tenantContext = getTenantContextFromUser({
    tenantId: user.tenantId,
    role: user.role,
  })
  
  // 4. Database operation with tenant isolation
  try {
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.qrSession.create({
        data: {
          tenantId: user.tenantId,
          // ... other fields
        }
      })
    })
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error creating QR session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Pattern 2: List Endpoint with Tenant Isolation

```typescript
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const tenantContext = getTenantContextFromUser({
    tenantId: user.tenantId,
    role: user.role,
  })
  
  const items = await withTenantContext(db, tenantContext, async (tx) => {
    return await tx.item.findMany({
      where: {
        // Filters are applied automatically by RLS
        // You can add additional business logic filters
        status: 'active'
      },
      orderBy: { createdAt: 'desc' }
    })
  })
  
  return NextResponse.json(items)
}
```

### Pattern 3: Testing Tenant Isolation

```typescript
import { describe, it, expect } from 'vitest'
import { getTenantContextFromUser } from '@/lib/middleware/tenant-context'

describe('Tenant Isolation', () => {
  it('should prevent cross-tenant access', () => {
    const tenant1Context = getTenantContextFromUser({
      tenantId: 'tenant-1',
      role: 'USER'
    })
    
    const tenant2Context = getTenantContextFromUser({
      tenantId: 'tenant-2',
      role: 'USER'
    })
    
    expect(tenant1Context.tenantId).not.toBe(tenant2Context.tenantId)
  })
})
```

### Pattern 4: Super Admin Operations

```typescript
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const tenantContext = getTenantContextFromUser({
    tenantId: user.tenantId,
    role: user.role,
  })
  
  // Check if super admin
  if (!tenantContext.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  // Super admin can access across tenants
  const allTenantData = await db.item.findMany()
  return NextResponse.json(allTenantData)
}
```

---

## Troubleshooting

### Issue: "Cannot find module 'tenant-context'"
**Solution**: Ensure import path is correct
```typescript
// ✅ Correct
import { withTenantContext } from '@/lib/middleware/tenant-context'

// ❌ Wrong
import { withTenantContext } from '@/middleware/tenant-context'
```

### Issue: Rate limit not working
**Checklist**:
1. Verify rate limiter is called at start of route: `if (rateLimitResult) return rateLimitResult`
2. Ensure you're using correct limiter type
3. Check X-Forwarded-For header is set (for IP-based limiting)

### Issue: Tenant context not applying
**Checklist**:
1. User must have valid tenantId in JWT
2. Database must have RLS enabled (after migration)
3. Use `withTenantContext` wrapper for all queries
4. Verify tenant context is passed correctly

### Issue: RLS policies not active
**Action Required**:
```bash
# Apply RLS migration
psql $DATABASE_URL < prisma/migrations/20251102_add_rls_policies.sql

# Verify RLS is enabled
psql $DATABASE_URL
\d contacts  # Should show "Row security: enabled"
```

---

## Performance Considerations

### Database Performance
- RLS adds ~5-10% query overhead
- All tenant_id columns are indexed
- Use filtered indexes for frequently queried states

### Rate Limiting Performance
- In-memory store is fast (<1ms)
- ~1KB memory per tracked client
- For large user bases, migrate to Redis

### Optimization Tips
1. **Batch operations**: Wrap multiple operations in one `withTenantContext`
2. **Use indexes**: Tenant-filtered indexes already created
3. **Query optimization**: Add business logic filters after tenant isolation
4. **Monitor**: Track query times in production

---

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Coverage report
npm test:coverage

# UI mode (visual test explorer)
npm test:ui

# Run specific test file
npm test -- rate-limit.test.ts

# Run tests matching pattern
npm test -- --grep "tenant"
```

---

## Resources

- **Test Files**: `src/lib/middleware/__tests__/`
- **Utilities**: `src/lib/test-utils/`
- **Migration**: `prisma/migrations/20251102_add_rls_policies.sql`
- **Documentation**: `PHASE_1_COMPLETE_SUMMARY.md`

---

## Next Steps

1. **Update all API routes** to use `withTenantContext`
2. **Apply RLS migration** to production database
3. **Monitor** rate limit metrics in production
4. **Test** with production traffic patterns
5. **Gradually roll out** rate limiting (10% → 50% → 100%)

---

**For questions**: Contact DevOps or Security team  
**Last Updated**: November 2, 2025

