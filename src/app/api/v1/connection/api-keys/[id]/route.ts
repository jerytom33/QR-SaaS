import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Dynamic API Key Routes (/api/v1/connection/api-keys/[id])
 * Handles individual API key operations with multi-tenant isolation
 */

// Mock authentication
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

const apiKeyUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional()
})

// GET - Retrieve individual API key (metadata only)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authenticate
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role
    })

    // 4. Fetch API key with RLS
    const apiKey = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.apiKey.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          isActive: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true
          // Never return keyHash
        }
      })
    })

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API key not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: apiKey,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get('x-request-id') || 'unknown'
        }
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /api-keys/[id] error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update individual API key
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authenticate
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role
    })

    // 4. Validate request
    const body = await request.json()
    const validation = apiKeyUpdateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        message: validation.error.message
      }, { status: 400 })
    }

    // 5. Update API key with RLS
    const apiKey = await withTenantContext(db, tenantContext, async (tx) => {
      // Verify ownership
      const existing = await tx.apiKey.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      // Check for duplicate name (exclude self)
      if (validation.data.name) {
        const duplicate = await tx.apiKey.findFirst({
          where: {
            tenantId: user.tenantId,
            name: validation.data.name,
            NOT: { id: params.id }
          }
        })

        if (duplicate) {
          throw new Error('DUPLICATE_NAME')
        }
      }

      // Update API key
      return await tx.apiKey.update({
        where: { id: params.id },
        data: validation.data,
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          isActive: true,
          lastUsedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true
        }
      })
    })

    return NextResponse.json(
      {
        success: true,
        data: apiKey,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get('x-request-id') || 'unknown'
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('PUT /api-keys/[id] error:', error)
    if (error.message === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: 'API key not found' },
        { status: 404 }
      )
    }
    if (error.message === 'DUPLICATE_NAME') {
      return NextResponse.json({
        success: false,
        error: 'Duplicate name',
        message: 'API key name already exists'
      }, { status: 409 })
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete individual API key (revoke)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Rate limiting
  const rateLimitResult = await authenticatedRateLimiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    // 2. Authenticate
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: user.tenantId,
      role: user.role
    })

    // 4. Delete API key with RLS
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Verify ownership
      const existing = await tx.apiKey.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      // Delete API key (revoke)
      return await tx.apiKey.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json(
      {
        success: true,
        message: 'API key deleted successfully',
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get('x-request-id') || 'unknown'
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('DELETE /api-keys/[id] error:', error)
    if (error.message === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: 'API key not found' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
