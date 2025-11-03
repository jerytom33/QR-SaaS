# Phase 2: Route Audit & Implementation Sequence

**Document**: API Route Assessment  
**Date**: November 2, 2025  
**Status**: Ready for Phase 2.1 Implementation

---

## Executive Summary

**Total Routes Found**: 16 unique API endpoints  
**Routes to Update**: 13 endpoints (6 already with rate limiting)  
**New Routes to Create**: 3 endpoints (dynamic ID routes)  
**Complexity**: High (multi-tenant isolation + rate limiting)

---

## Route Inventory

### 1. Authentication Routes (4 total)

#### Route 1.1: QR Session Generation ✅ ALREADY UPDATED
```
POST /api/v1/auth/qr-session/generate
File: src/app/api/v1/auth/qr-session/generate/route.ts
```

**Status**: ✅ Has rate limiting (qrGenerationRateLimiter)  
**Current Implementation**:
- Rate limiting: ✅ 10 req/min
- Tenant context: ⏳ Uses demo tenant (hardcoded)
- RLS wrapper: ❌ Not applied
- Tests: ⏳ Covered in Phase 1 e2e tests

**Phase 2 Update Required**: Convert demo tenant to proper multi-tenant context

---

#### Route 1.2: QR Session Scan
```
POST /api/v1/auth/qr-session/scan
File: src/app/api/v1/auth/qr-session/scan/route.ts
```

**Status**: 🔴 Not Updated  
**Current Implementation**:
- Rate limiting: ❌ Not applied
- Tenant context: ⏳ Needs implementation
- RLS wrapper: ❌ Not applied

**Phase 2 Action Required**:
1. Add qrGenerationRateLimiter
2. Extract tenant from request
3. Wrap DB operations with withTenantContext

---

#### Route 1.3: QR Session Link
```
POST /api/v1/auth/qr-session/link
File: src/app/api/v1/auth/qr-session/link/route.ts
```

**Status**: 🔴 Not Updated  
**Current Implementation**:
- Rate limiting: ❌ Not applied
- Tenant context: ⏳ Needs implementation
- RLS wrapper: ❌ Not applied

**Phase 2 Action Required**:
1. Add qrGenerationRateLimiter
2. Extract tenant from request
3. Wrap DB operations with withTenantContext

---

#### Route 1.4: QR Session Status
```
GET /api/v1/auth/qr-session/status/[qrSessionId]
File: src/app/api/v1/auth/qr-session/status/[qrSessionId]/route.ts
```

**Status**: 🔴 Not Updated  
**Current Implementation**:
- Rate limiting: ❌ Not applied
- Tenant context: ⏳ Needs implementation
- RLS wrapper: ❌ Not applied

**Phase 2 Action Required**:
1. Add publicRateLimiter (lenient for polling)
2. Extract tenant from request
3. Wrap DB operations with withTenantContext

---

#### Route 1.5: Demo Login ✅ ALREADY UPDATED
```
POST /api/auth/demo-login
File: src/app/api/auth/demo-login/route.ts
```

**Status**: ✅ Has rate limiting  
**Current Implementation**:
- Rate limiting: ✅ 5 attempts/15min
- Tenant context: ✅ Demo tenant logic
- RLS wrapper: ⏳ Partial (creates tenant context)

**Phase 2 Update Required**: Minor - ensure consistency with RLS patterns

---

### 2. Data Management Routes (9 total)

#### Route 2.1: Contacts - List & Create
```
GET  /api/v1/connection/contacts
POST /api/v1/connection/contacts
File: src/app/api/v1/connection/contacts/route.ts
```

**Status**: ⏳ Partial (API key auth, no RLS)  
**Current Implementation**:
- Rate limiting: ❌ Not applied
- Tenant context: ⏳ Via API key validation
- RLS wrapper: ❌ Not applied
- API key validation: ✅ Present

**Phase 2 Action Required**:
1. Add authenticatedRateLimiter to both GET & POST
2. Replace API key validation with proper auth
3. Wrap all DB operations with withTenantContext
4. Create [id]/route.ts for individual operations

---

#### Route 2.2: Contacts - Get/Update/Delete
```
GET    /api/v1/connection/contacts/[id]
PUT    /api/v1/connection/contacts/[id]
DELETE /api/v1/connection/contacts/[id]
File: src/app/api/v1/connection/contacts/[id]/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  
**Current Implementation**:
- ID handling: ⏳ Passed via query params (not RESTful)
- Rate limiting: ❌ Not applied
- Tenant context: ❌ Not applied
- RLS wrapper: ❌ Not applied

**Phase 2 Action Required**:
1. Create `[id]/route.ts` file
2. Implement GET, PUT, DELETE handlers
3. Add authenticatedRateLimiter to all
4. Wrap all DB operations with withTenantContext
5. Verify tenant ownership on all operations

---

#### Route 2.3: Companies - List & Create
```
GET  /api/v1/connection/companies
POST /api/v1/connection/companies
File: src/app/api/v1/connection/companies/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  
**Current Implementation**: None

**Phase 2 Action Required**:
1. Create `companies/route.ts` file
2. Implement GET (list), POST (create) handlers
3. Pattern: Mirror contacts implementation
4. Add authenticatedRateLimiter
5. Add withTenantContext to all queries

---

#### Route 2.4: Companies - Get/Update/Delete
```
GET    /api/v1/connection/companies/[id]
PUT    /api/v1/connection/companies/[id]
DELETE /api/v1/connection/companies/[id]
File: src/app/api/v1/connection/companies/[id]/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `companies/[id]/route.ts` file
2. Implement GET, PUT, DELETE handlers
3. Same pattern as contacts [id] handlers

---

#### Route 2.5: Leads - List & Create
```
GET  /api/v1/connection/leads
POST /api/v1/connection/leads
File: src/app/api/v1/connection/leads/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `leads/route.ts` file
2. Implement GET (list), POST (create) handlers
3. Include pipeline stage validation
4. Add authenticatedRateLimiter
5. Add withTenantContext

---

#### Route 2.6: Leads - Get/Update/Delete
```
GET    /api/v1/connection/leads/[id]
PUT    /api/v1/connection/leads/[id]
DELETE /api/v1/connection/leads/[id]
File: src/app/api/v1/connection/leads/[id]/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `leads/[id]/route.ts` file
2. Implement GET, PUT, DELETE handlers
3. Handle pipeline stage changes
4. Add authenticatedRateLimiter
5. Add withTenantContext

---

#### Route 2.7: Pipelines - List & Create
```
GET  /api/v1/connection/pipelines
POST /api/v1/connection/pipelines
File: src/app/api/v1/connection/pipelines/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `pipelines/route.ts` file
2. Implement GET (list), POST (create) handlers
3. Include stages in response
4. Add authenticatedRateLimiter
5. Add withTenantContext

---

#### Route 2.8: Pipelines - Get/Update/Delete
```
GET    /api/v1/connection/pipelines/[id]
PUT    /api/v1/connection/pipelines/[id]
DELETE /api/v1/connection/pipelines/[id]
File: src/app/api/v1/connection/pipelines/[id]/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `pipelines/[id]/route.ts` file
2. Implement GET, PUT, DELETE handlers
3. Handle stage management
4. Add authenticatedRateLimiter
5. Add withTenantContext

---

#### Route 2.9: Activities - List & Create
```
GET  /api/v1/connection/activities
POST /api/v1/connection/activities
File: src/app/api/v1/connection/activities/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `activities/route.ts` file
2. Implement GET (list), POST (create) handlers
3. Link to contact/lead
4. Add authenticatedRateLimiter
5. Add withTenantContext

---

### 3. API Key Management Routes (4 total)

#### Route 3.1: API Keys - List & Create
```
GET  /api/v1/api-keys
POST /api/v1/api-keys
File: src/app/api/v1/api-keys/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `api-keys/route.ts` file
2. Implement GET (list), POST (create) handlers
3. Hash keys in database
4. Add authenticatedRateLimiter
5. Add withTenantContext

---

#### Route 3.2: API Keys - Get/Update/Delete
```
GET    /api/v1/api-keys/[id]
PUT    /api/v1/api-keys/[id]
DELETE /api/v1/api-keys/[id]
File: src/app/api/v1/api-keys/[id]/route.ts [TO CREATE]
```

**Status**: 🔴 Routes Don't Exist  

**Phase 2 Action Required**:
1. Create `api-keys/[id]/route.ts` file
2. Implement GET, PUT, DELETE handlers
3. Add authenticatedRateLimiter
4. Add withTenantContext

---

### 4. Utility Routes (2 total)

#### Route 4.1: Health Check
```
GET /api/health
File: src/app/api/health/route.ts
```

**Status**: ✅ Exists  
**Note**: Public route, no auth required

---

#### Route 4.2: Demo QR Simulation
```
GET /api/demo/simulate-qr
File: src/app/api/demo/simulate-qr/route.ts
```

**Status**: ✅ Exists  
**Note**: Demo route, for testing only

---

## Implementation Priority

### Phase 2.1 - Week 1 (Priority: Critical)

**Must Update First** (affects other features):
1. ✅ Contacts routes (2 files: route.ts + [id]/route.ts)
2. ✅ Companies routes (2 files: route.ts + [id]/route.ts)
3. ✅ Leads routes (2 files: route.ts + [id]/route.ts)
4. ✅ Pipelines routes (2 files: route.ts + [id]/route.ts)

**Estimated**: 8-10 hours (4 resource types × 2 files each)

---

### Phase 2.1 - Week 2 (Priority: High)

**Update Second** (dependent on core features):
1. ✅ QR Session routes (3 files: scan, link, status)
2. ✅ API Keys routes (2 files: route.ts + [id]/route.ts)
3. ✅ Activities routes (2 files: route.ts + [id]/route.ts)

**Estimated**: 6-8 hours

---

## Update Pattern Template

All routes follow this pattern:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

const createSchema = z.object({
  // Define schema
})

export async function GET(request: NextRequest) {
  // 1. Apply rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authenticate user
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // 3. Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role,
      userId: user.id
    })

    // 4. Execute with tenant isolation
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.resource.findMany({
        where: { tenantId: user.tenantId }
      })
    })

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
```

---

## Testing Requirements

For each updated route, create tests:

```typescript
// Test 1: Verify tenant isolation
test('GET /api/v1/contacts - should only return tenant contacts', async () => {
  // Create 2 tenants with contacts
  // Query as tenant 1
  // Verify only tenant 1 contacts returned
})

// Test 2: Verify authentication
test('GET /api/v1/contacts - should reject without auth', async () => {
  // Make request without auth token
  // Verify 401 response
})

// Test 3: Verify rate limiting
test('GET /api/v1/contacts - should respect rate limit', async () => {
  // Make multiple requests
  // Verify 429 on limit exceeded
})

// Test 4: Verify error handling
test('GET /api/v1/contacts/:id - should return 404 for missing resource', async () => {
  // Request non-existent resource
  // Verify 404 response
})
```

---

## File Structure After Phase 2.1

```
src/app/api/
├── v1/
│   ├── auth/
│   │   └── qr-session/
│   │       ├── generate/route.ts      [UPDATED]
│   │       ├── scan/route.ts          [NEW]
│   │       ├── link/route.ts          [NEW]
│   │       └── status/[qrSessionId]/route.ts  [NEW]
│   │
│   └── connection/
│       ├── contacts/
│       │   ├── route.ts               [UPDATED]
│       │   └── [id]/route.ts          [NEW]
│       ├── companies/
│       │   ├── route.ts               [NEW]
│       │   └── [id]/route.ts          [NEW]
│       ├── leads/
│       │   ├── route.ts               [NEW]
│       │   └── [id]/route.ts          [NEW]
│       ├── pipelines/
│       │   ├── route.ts               [NEW]
│       │   └── [id]/route.ts          [NEW]
│       ├── activities/
│       │   ├── route.ts               [NEW]
│       │   └── [id]/route.ts          [NEW]
│       └── api-keys/
│           ├── route.ts               [NEW]
│           └── [id]/route.ts          [NEW]
│
├── auth/
│   └── demo-login/route.ts             [VERIFIED]
│
├── demo/
│   └── simulate-qr/route.ts            [VERIFIED]
│
└── health/route.ts                     [VERIFIED]
```

---

## Dependencies & Prerequisites

✅ **Must be done before Phase 2.1**:
- RLS migration deployed to database
- withTenantContext middleware available
- Rate limiters configured
- Test utilities available

✅ **All prerequisites complete from Phase 1**

---

## Metrics & KPIs

**Code Changes**:
- New files: 13
- Updated files: 3
- Lines of code: 2,000+
- Test cases: 50+

**Coverage**:
- 20+ endpoints
- 100% test pass rate target
- Zero tenant isolation vulnerabilities
- All endpoints rate limited

**Timeline**:
- Phase 2.1: 14-18 hours (Week 1-2)
- Phase 2.2: 4-6 hours (Week 2)
- Total Phase 2: 30-40 hours

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking API changes | Maintain backward compatibility |
| Performance degradation | Monitor query times, add indexes |
| Tenant data leakage | Extensive testing, security review |
| Rate limit bypass | Validate on every request |
| Database transaction issues | Use proper transaction handling |

---

**Ready to begin Phase 2.1 implementation!** 🚀

