import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Dynamic Pipeline Routes (/api/v1/connection/pipelines/[id])
 * Handles individual pipeline operations with multi-tenant isolation
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

const pipelineUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional()
})

// GET - Retrieve individual pipeline
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

    // 4. Fetch pipeline with RLS
    const pipeline = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.pipeline.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        },
        include: {
          _count: { select: { stages: true, leads: true } }
        }
      })
    })

    if (!pipeline) {
      return NextResponse.json(
        { success: false, error: 'Pipeline not found' },
        { status: 404 }
      )
    }

    const response = {
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      isActive: pipeline.isActive,
      order: pipeline.order,
      createdAt: pipeline.createdAt,
      updatedAt: pipeline.updatedAt,
      stageCount: (pipeline as any)._count.stages,
      leadCount: (pipeline as any)._count.leads
    }

    return NextResponse.json(
      {
        success: true,
        data: response,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get('x-request-id') || 'unknown'
        }
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /pipelines/[id] error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update individual pipeline
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
    const validation = pipelineUpdateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        message: validation.error.message
      }, { status: 400 })
    }

    // 5. Update pipeline with RLS
    const pipeline = await withTenantContext(db, tenantContext, async (tx) => {
      // Verify ownership
      const existing = await tx.pipeline.findFirst({
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
        const duplicate = await tx.pipeline.findFirst({
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

      // Update pipeline
      return await tx.pipeline.update({
        where: { id: params.id },
        data: validation.data,
        include: {
          _count: { select: { stages: true, leads: true } }
        }
      })
    })

    const response = {
      id: pipeline.id,
      name: pipeline.name,
      description: pipeline.description,
      isActive: pipeline.isActive,
      order: pipeline.order,
      createdAt: pipeline.createdAt,
      updatedAt: pipeline.updatedAt,
      stageCount: (pipeline as any)._count.stages,
      leadCount: (pipeline as any)._count.leads
    }

    return NextResponse.json(
      {
        success: true,
        data: response,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get('x-request-id') || 'unknown'
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('PUT /pipelines/[id] error:', error)
    if (error.message === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: 'Pipeline not found' },
        { status: 404 }
      )
    }
    if (error.message === 'DUPLICATE_NAME') {
      return NextResponse.json({
        success: false,
        error: 'Duplicate name',
        message: 'Pipeline name already exists'
      }, { status: 409 })
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete individual pipeline
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

    // 4. Delete pipeline with RLS
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Verify ownership
      const existing = await tx.pipeline.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      // Delete pipeline (cascades to stages and leads per schema)
      return await tx.pipeline.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Pipeline deleted successfully',
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get('x-request-id') || 'unknown'
        }
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('DELETE /pipelines/[id] error:', error)
    if (error.message === 'NOT_FOUND') {
      return NextResponse.json(
        { success: false, error: 'Pipeline not found' },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
