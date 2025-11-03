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

const createQRSessionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

const updateQRSessionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.enum(['PENDING', 'LINKED', 'VERIFIED', 'EXPIRED', 'REVOKED']).optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

// ============================================================================
// GET: List QR Sessions
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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status')
    const search = searchParams.get('search') || ''
    const offset = (page - 1) * limit

    // Build where clause
    const where: any = {
      tenantId: user.tenantId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { qrCodeData: { contains: search } }
        ]
      })
    }

    // 5. Execute with tenant isolation
    const [sessions, total] = await withTenantContext(db, tenantContext, async (tx) => {
      return await Promise.all([
        tx.qRSession.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit
        }),
        tx.qRSession.count({ where })
      ])
    })

    return NextResponse.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('QR Sessions GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch QR sessions'
    }, { status: 500 })
  }
}

// ============================================================================
// POST: Create QR Session
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
    const validatedData = createQRSessionSchema.parse(body)

    // 5. Create QR session with RLS
    const session = await withTenantContext(db, tenantContext, async (tx) => {
      // Generate unique QR code data
      const qrCodeData = `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      return tx.qRSession.create({
        data: {
          tenantId: user.tenantId,
          status: 'PENDING',
          qrCodeData,
          expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : new Date(Date.now() + 3600000), // 1 hour default
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        session
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
    console.error('QR Sessions POST error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create QR session'
    }, { status: 500 })
  }
}

// ============================================================================
// PUT: Update QR Session
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
    const { ids, data } = z.object({
      ids: z.array(z.string()),
      data: updateQRSessionSchema
    }).parse(body)

    // 5. Update with RLS
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.qRSession.updateMany({
        where: {
          id: { in: ids },
          tenantId: user.tenantId
        },
        data: {
          status: data.status,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        }
      })
    })

    return NextResponse.json({
      success: true,
      message: `Updated ${result.count} QR session(s)`,
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
    console.error('QR Sessions PUT error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update QR sessions'
    }, { status: 500 })
  }
}

// ============================================================================
// DELETE: Delete QR Sessions
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

    // 5. Delete with RLS
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.qRSession.deleteMany({
        where: {
          id: { in: ids },
          tenantId: user.tenantId
        }
      })
    })

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} QR session(s)`,
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
    console.error('QR Sessions DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete QR sessions'
    }, { status: 500 })
  }
}
