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

const updateQRSessionSchema = z.object({
  status: z.enum(['PENDING', 'LINKED', 'VERIFIED', 'EXPIRED', 'REVOKED']).optional(),
  expiresAt: z.string().datetime().optional(),
})

// ============================================================================
// GET: Retrieve Individual QR Session
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // 4. Retrieve session with RLS
    const session = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.qRSession.findUnique({
        where: { id: params.id }
      })
    })

    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'QR session not found'
      }, { status: 404 })
    }

    // Verify tenant ownership
    if (session.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: {
        session
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('QR Session GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch QR session'
    }, { status: 500 })
  }
}

// ============================================================================
// PUT: Update Individual QR Session
// ============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const validatedData = updateQRSessionSchema.parse(body)

    // 5. Get current session to verify ownership
    const currentSession = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.qRSession.findUnique({
        where: { id: params.id }
      })
    })

    if (!currentSession) {
      return NextResponse.json({
        success: false,
        error: 'QR session not found'
      }, { status: 404 })
    }

    if (currentSession.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    // 6. Update session with RLS
    const updatedSession = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.qRSession.update({
        where: { id: params.id },
        data: {
          status: validatedData.status,
          expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        session: updatedSession
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
        error: 'Invalid request body'
      }, { status: 400 })
    }
    console.error('QR Session PUT error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update QR session'
    }, { status: 500 })
  }
}

// ============================================================================
// DELETE: Delete Individual QR Session
// ============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // 4. Get session to verify ownership
    const session = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.qRSession.findUnique({
        where: { id: params.id }
      })
    })

    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'QR session not found'
      }, { status: 404 })
    }

    if (session.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    // 5. Delete session with RLS
    await withTenantContext(db, tenantContext, async (tx) => {
      return tx.qRSession.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'QR session deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('QR Session DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete QR session'
    }, { status: 500 })
  }
}
