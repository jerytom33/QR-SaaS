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
// GET: Retrieve Individual Activity
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

    // 4. Retrieve activity with RLS
    const activity = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.activity.findUnique({
        where: { id: params.id }
      })
    })

    if (!activity) {
      return NextResponse.json({
        success: false,
        error: 'Activity not found'
      }, { status: 404 })
    }

    // Verify tenant ownership
    if (activity.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: {
        activity
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Activity GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch activity'
    }, { status: 500 })
  }
}

// ============================================================================
// DELETE: Delete Individual Activity
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

    // 4. Get activity to verify ownership
    const activity = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.activity.findUnique({
        where: { id: params.id }
      })
    })

    if (!activity) {
      return NextResponse.json({
        success: false,
        error: 'Activity not found'
      }, { status: 404 })
    }

    if (activity.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    // 5. Delete activity with RLS
    await withTenantContext(db, tenantContext, async (tx) => {
      return tx.activity.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Activity deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Activity DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete activity'
    }, { status: 500 })
  }
}
