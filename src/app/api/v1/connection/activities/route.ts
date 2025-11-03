import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'
import { v4 as uuidv4 } from 'uuid'

// ============================================================================
// AUTH HELPER
// ============================================================================

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const userId = request.headers.get('x-user-id')
  const tenantId = request.headers.get('x-tenant-id')
  const role = request.headers.get('x-user-role') || 'USER'

  if (!userId || !tenantId) {
    return null
  }

  return {
    id: userId,
    tenantId,
    role: role as 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER'
  }
}

// ============================================================================
// SCHEMAS
// ============================================================================

const createActivitySchema = z.object({
  entityType: z.enum(['CONTACT', 'COMPANY', 'LEAD', 'PIPELINE', 'STAGE', 'WEBHOOK', 'API_KEY']),
  entityId: z.string().min(1),
  actionType: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LINKED', 'VERIFIED', 'ACTIVATED', 'DEACTIVATED']),
  changes: z.record(z.string(), z.any()).optional(),
  description: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

const activityFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  entityType: z.enum(['CONTACT', 'COMPANY', 'LEAD', 'PIPELINE', 'STAGE', 'WEBHOOK', 'API_KEY']).optional(),
  actionType: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LINKED', 'VERIFIED', 'ACTIVATED', 'DEACTIVATED']).optional(),
  entityId: z.string().optional(),
  userId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

// ============================================================================
// GET: List Activities
// ============================================================================

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
      role: user.role
    })

    // 4. Parse query parameters
    const { searchParams } = new URL(request.url)
    const filters = activityFilterSchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      entityType: searchParams.get('entityType'),
      actionType: searchParams.get('actionType'),
      entityId: searchParams.get('entityId'),
      userId: searchParams.get('userId'),
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
    })

    const offset = (filters.page - 1) * filters.limit

    // Build where clause
    const where: any = {
      tenantId: user.tenantId,
    }

    if (filters.entityType) {
      where.entityType = filters.entityType
    }

    if (filters.actionType) {
      where.actionType = filters.actionType
    }

    if (filters.entityId) {
      where.entityId = filters.entityId
    }

    if (filters.userId) {
      where.userId = filters.userId
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {}
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate)
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate)
      }
    }

    // 5. Execute with tenant isolation
    const [activities, total] = await withTenantContext(db, tenantContext, async (tx) => {
      return await Promise.all([
        tx.activity.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: filters.limit,
          select: {
            id: true,
            entityType: true,
            entityId: true,
            actionType: true,
            userId: true,
            userEmail: true,
            changes: true,
            description: true,
            metadata: true,
            createdAt: true,
          }
        }),
        tx.activity.count({ where })
      ])
    })

    return NextResponse.json({
      success: true,
      data: {
        activities,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pages: Math.ceil(total / filters.limit)
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid query parameters'
      }, { status: 400 })
    }
    console.error('Activities GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch activities'
    }, { status: 500 })
  }
}

// ============================================================================
// POST: Create Activity
// ============================================================================

export async function POST(request: NextRequest) {
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
      role: user.role
    })

    // 4. Validate request body
    const body = await request.json()
    const validatedData = createActivitySchema.parse(body)

    // 5. Create activity with RLS
    const activity = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.activity.create({
        data: {
          tenantId: user.tenantId,
          entityType: validatedData.entityType,
          entityId: validatedData.entityId,
          actionType: validatedData.actionType,
          userId: user.id,
          userEmail: 'user@example.com', // Should come from auth token
          changes: validatedData.changes || {},
          description: validatedData.description,
          metadata: validatedData.metadata || {},
        },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          actionType: true,
          userId: true,
          userEmail: true,
          changes: true,
          description: true,
          metadata: true,
          createdAt: true,
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        activity
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    }, { status: 201 })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request body'
      }, { status: 400 })
    }
    console.error('Activities POST error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create activity'
    }, { status: 500 })
  }
}

// ============================================================================
// PUT: Update Activities (batch operations)
// ============================================================================

export async function PUT(request: NextRequest) {
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
      role: user.role
    })

    // 4. Validate request body
    const body = await request.json()
    const { ids, metadata } = z.object({
      ids: z.array(z.string()),
      metadata: z.record(z.string(), z.any()).optional(),
    }).parse(body)

    // 5. Update activities with RLS
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.activity.updateMany({
        where: {
          id: { in: ids },
          tenantId: user.tenantId
        },
        data: {
          metadata: metadata || {}
        }
      })
    })

    return NextResponse.json({
      success: true,
      message: `Updated ${result.count} activities`,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request body'
      }, { status: 400 })
    }
    console.error('Activities PUT error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update activities'
    }, { status: 500 })
  }
}

// ============================================================================
// DELETE: Delete Activities (batch operations)
// ============================================================================

export async function DELETE(request: NextRequest) {
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
      role: user.role
    })

    // 4. Validate request body
    const body = await request.json()
    const { ids } = z.object({
      ids: z.array(z.string())
    }).parse(body)

    // 5. Delete activities with RLS
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.activity.deleteMany({
        where: {
          id: { in: ids },
          tenantId: user.tenantId
        }
      })
    })

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} activities`,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request body'
      }, { status: 400 })
    }
    console.error('Activities DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete activities'
    }, { status: 500 })
  }
}
