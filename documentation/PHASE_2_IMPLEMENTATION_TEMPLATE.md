# Phase 2.1: Route Implementation Template

This document provides a copy-paste ready template for implementing the remaining 12 routes with the same JWT auth + RLS + rate limiting pattern established in Phase 2.1a (Contacts).

## Quick Implementation Checklist

For each of the 12 remaining routes:
- [ ] Copy this template
- [ ] Replace `RESOURCE_NAME` with actual resource (Company, Lead, Pipeline, etc.)
- [ ] Adjust validation schema fields based on Prisma model
- [ ] Create main route handler file: `src/app/api/v1/connection/[resource]/route.ts`
- [ ] Create dynamic route handler file: `src/app/api/v1/connection/[resource]/[id]/route.ts`
- [ ] Create test file: `src/lib/middleware/__tests__/[resource].test.ts`
- [ ] Run tests and verify 100% pass rate
- [ ] Verify 0 TypeScript compilation errors

## Routes Remaining (12)

1. ✅ Contacts (COMPLETE)
2. Companies
3. Leads
4. Pipelines
5. API Keys
6. QR Sessions
7. Activities
8. Webhooks (with special handling)
9. Webhook Events (with special handling)
10. Bulk Operations
11. Import/Export
12. Analytics

## Template: Main Route Handler

**File**: `src/app/api/v1/connection/RESOURCE/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'
import { v4 as uuidv4 } from 'uuid'

// Authentication helper
async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  
  const userId = request.headers.get('x-user-id')
  const tenantId = request.headers.get('x-tenant-id')
  const role = request.headers.get('x-user-role') || 'USER'
  
  if (!userId || !tenantId) return null
  
  return {
    id: userId,
    tenantId,
    role: role as 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER'
  }
}

// Validation schemas - CUSTOMIZE FOR RESOURCE
const createRESOURCESchema = z.object({
  // Add fields based on Prisma model
  // Example: name: z.string().min(1),
  // Example: description: z.string().optional(),
})

const updateRESOURCESchema = createRESOURCESchema.partial()

// GET /api/v1/connection/RESOURCE
export async function GET(request: NextRequest) {
  // 1. Rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authentication
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // 3. Tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role
    })

    // 4. Parse query parameters
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const skip = (page - 1) * limit

    // 5. Query with RLS wrapper
    const [resources, total] = await withTenantContext(db, tenantContext, async (tx) => {
      return await Promise.all([
        tx.RESOURCE_MODEL.findMany({
          where: {
            tenantId: user.tenantId,
            // Add search/filter conditions here
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        tx.RESOURCE_MODEL.count({
          where: {
            tenantId: user.tenantId
          }
        })
      ])
    })

    return NextResponse.json({
      success: true,
      data: resources,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('GET RESOURCE error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch resources'
    }, { status: 500 })
  }
}

// POST /api/v1/connection/RESOURCE
export async function POST(request: NextRequest) {
  // 1. Rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authentication
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // 3. Tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role
    })

    // 4. Parse and validate request body
    const body = await request.json()
    const validation = createRESOURCESchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message
      }))
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        issues: errors
      }, { status: 400 })
    }

    // 5. Create with RLS wrapper
    const resource = await withTenantContext(db, tenantContext, async (tx) => {
      // Check for duplicates if needed
      // const existing = await tx.RESOURCE_MODEL.findFirst({ where: { ... } })
      // if (existing) throw new Error('DUPLICATE')

      return await tx.RESOURCE_MODEL.create({
        data: {
          ...validation.data,
          tenantId: user.tenantId,
          createdBy: user.id
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: resource,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    }, { status: 201 })

  } catch (error) {
    console.error('POST RESOURCE error:', error)

    if (error instanceof Error && error.message === 'DUPLICATE') {
      return NextResponse.json({
        success: false,
        error: 'Resource already exists'
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to create resource'
    }, { status: 500 })
  }
}

// PUT /api/v1/connection/RESOURCE
export async function PUT(request: NextRequest) {
  // 1. Rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authentication
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // 3. Tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role
    })

    // 4. Get ID and validate
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Resource ID is required'
      }, { status: 400 })
    }

    // 5. Parse and validate request body
    const body = await request.json()
    const validation = updateRESOURCESchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message
      }))
      return NextResponse.json({
        success: false,
        error: 'Validation failed',
        issues: errors
      }, { status: 400 })
    }

    // 6. Update with RLS wrapper and ownership check
    const updated = await withTenantContext(db, tenantContext, async (tx) => {
      const existing = await tx.RESOURCE_MODEL.findFirst({
        where: {
          id,
          tenantId: user.tenantId
        }
      })

      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      return await tx.RESOURCE_MODEL.update({
        where: { id },
        data: validation.data
      })
    })

    return NextResponse.json({
      success: true,
      data: updated,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('PUT RESOURCE error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Resource not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to update resource'
    }, { status: 500 })
  }
}

// DELETE /api/v1/connection/RESOURCE
export async function DELETE(request: NextRequest) {
  // 1. Rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authentication
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 })
    }

    // 3. Tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role
    })

    // 4. Get ID
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Resource ID is required'
      }, { status: 400 })
    }

    // 5. Delete with RLS wrapper
    await withTenantContext(db, tenantContext, async (tx) => {
      const existing = await tx.RESOURCE_MODEL.findFirst({
        where: {
          id,
          tenantId: user.tenantId
        }
      })

      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      await tx.RESOURCE_MODEL.delete({
        where: { id }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Resource deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('DELETE RESOURCE error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Resource not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to delete resource'
    }, { status: 500 })
  }
}
```

## Template: Dynamic Route Handler

**File**: `src/app/api/v1/connection/RESOURCE/[id]/route.ts`

Use the same template as above, but modify handlers to accept dynamic ID from params:

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Same as above, but use params.id instead of query param
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Same as above, but use params.id instead of query param
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Same as above, but use params.id instead of query param
}
```

## Template: Test File

**File**: `src/lib/middleware/__tests__/RESOURCE.test.ts`

Reference: `contacts.test.ts` (25+ tests)

For each new route, create similar test suite covering:
- Authentication & Authorization (3 tests)
- GET operations (4 tests)
- POST operations (5 tests)
- GET [id] operations (3 tests)
- PUT [id] operations (5 tests)
- DELETE [id] operations (3 tests)
- Multi-tenant Isolation (3 tests)
- Rate Limiting (2 tests)
- Error Handling (4 tests)
- Response Format (3 tests)

**Total**: 35-40 tests per route

## Step-by-Step Implementation Process

1. **Choose resource** (Company, Lead, etc.)
2. **Review Prisma model** for fields
3. **Copy main route template**
4. **Customize**:
   - Replace `RESOURCE` with actual name
   - Replace `RESOURCE_MODEL` with Prisma model
   - Add fields to validation schema
   - Adjust where conditions for filtering
5. **Create dynamic route** from template
6. **Create test file** using contacts.test.ts as reference
7. **Run tests**: `npm test` or `npx vitest`
8. **Verify**:
   - 0 TypeScript errors
   - All tests passing (35-40)
   - No console warnings
9. **Code review** before merging

## Key Points to Remember

✅ **Always start with rate limiting** - First check in every handler  
✅ **Always verify authentication** - Second check in every handler  
✅ **Always extract tenant context** - Third step in every handler  
✅ **Always wrap DB operations** - Use `withTenantContext` for ALL database calls  
✅ **Always validate inputs** - Use Zod schema for all user data  
✅ **Always verify ownership** - Check `tenantId` before update/delete  
✅ **Always include metadata** - timestamp and requestId in responses  
✅ **Always test tenant isolation** - Write tests for cross-tenant attempts  

## Estimated Time Per Route

- Main handler template: 20 minutes
- Dynamic handler template: 5 minutes
- Test suite: 30 minutes
- **Total per route**: ~55 minutes

**For 12 routes**: ~11 hours (approximately 1.5-2 working days)

## Success Metrics

- [ ] All handlers have rate limiting (first line)
- [ ] All handlers require JWT authentication
- [ ] All DB operations wrapped in withTenantContext
- [ ] All validation using Zod schemas
- [ ] All error responses with proper status codes
- [ ] All success responses with metadata
- [ ] 100% test pass rate
- [ ] 0 TypeScript compilation errors
- [ ] Test coverage > 90%
- [ ] No tenant data leakage

## Troubleshooting

**Issue**: "Cannot find name 'validateApiKey'"  
**Solution**: Remove all references - use `getAuthUser()` instead

**Issue**: TypeScript errors about validation  
**Solution**: Use `validation.data` and check `validation.success` first

**Issue**: Tests failing with "tenantId mismatch"  
**Solution**: Always pass `tenantId: user.tenantId` in where clauses

**Issue**: Rate limit tests failing  
**Solution**: Ensure `authenticatedRateLimiter` is imported and called first

**Issue**: RLS policy violations**  
**Solution**: Verify all DB operations use `withTenantContext` wrapper

## Next Steps After Completing All Routes

1. Update PHASE_2_STATUS_CHECKPOINT.md with completion metrics
2. Create PHASE_2_QUALITY_REPORT.md documenting security verification
3. Schedule code review for all 13 routes
4. Begin Phase 2.2 (Rate Limiting Refinement - already done)
5. Begin Phase 2.3 (Business Logic Enhancements)
6. Plan Phase 3 (Webhooks, Activity Logging, etc.)
