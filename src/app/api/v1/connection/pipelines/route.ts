import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Pipelines API Routes
 * Handles CRUD operations for sales pipelines with multi-tenant isolation
 */

// Mock authentication - in production, use proper JWT validation
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

const pipelineCreateSchema = z.object({
  name: z.string().min(1, 'Pipeline name required').max(255),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
  order: z.number().int().default(0)
})

const pipelineUpdateSchema = pipelineCreateSchema.partial()

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional()
})

// GET - List pipelines with pagination and filtering
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
    const search = searchParams.get('search') || ''
    const skip = (page - 1) * limit

    // 5. Query with RLS wrapper
    const [pipelines, total] = await withTenantContext(db, tenantContext, async (tx) => {
      const where = search
        ? {
            tenantId: user.tenantId,
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : { tenantId: user.tenantId }

      return await Promise.all([
        tx.pipeline.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { stages: true, leads: true } } }
        }),
        tx.pipeline.count({ where })
      ])
    })

    // Transform response to include stage count
    const pipelineList = pipelines.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isActive: p.isActive,
      order: p.order,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      stageCount: p._count.stages,
      leadCount: p._count.leads
    }))

    return NextResponse.json(
      {
        success: true,
        data: pipelineList,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: request.headers.get('x-request-id') || 'unknown'
        }
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /pipelines error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new pipeline
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

    // 4. Parse and validate request body
    const body = await request.json()
    const validation = pipelineCreateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        message: validation.error.message
      }, { status: 400 })
    }

    // 5. Create pipeline with RLS
    const pipeline = await withTenantContext(db, tenantContext, async (tx) => {
      // Check for duplicate name per tenant
      const existing = await tx.pipeline.findFirst({
        where: {
          tenantId: user.tenantId,
          name: validation.data.name
        }
      })

      if (existing) {
        throw new Error('DUPLICATE_NAME')
      }

      // Create new pipeline
      return await tx.pipeline.create({
        data: {
          ...validation.data,
          tenantId: user.tenantId
        },
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
      { status: 201 }
    )
  } catch (error: any) {
    console.error('POST /pipelines error:', error)
    if (error.message === 'DUPLICATE_NAME') {
      return NextResponse.json({
        success: false,
        error: 'Pipeline with this name already exists',
        message: 'Pipeline name must be unique per tenant'
      }, { status: 409 })
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Batch update (not typically used, returning error to use /[id])
export async function PUT(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Invalid request',
      message: 'Use PUT /pipelines/[id] for individual updates'
    },
    { status: 400 }
  )
}

// DELETE - Batch delete (not typically used, returning error to use /[id])
export async function DELETE(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Invalid request',
      message: 'Use DELETE /pipelines/[id] for individual deletion'
    },
    { status: 400 }
  )
}
