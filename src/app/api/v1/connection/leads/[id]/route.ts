import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'
import { v4 as uuidv4 } from 'uuid'

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

const updateLeadSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  value: z.number().optional(),
  currency: z.string().optional(),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  expectedCloseDate: z.string().optional(),
  actualCloseDate: z.string().optional(),
  contactId: z.string().optional(),
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  assignedTo: z.string().optional(),
})

// GET /api/v1/connection/leads/[id]
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

    // 4. Get lead with tenant isolation
    const lead = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.lead.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        },
        include: {
          pipeline: true,
          stage: true,
          contact: true
        }
      })
    })

    if (!lead) {
      return NextResponse.json({
        success: false,
        error: 'Lead not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: lead,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Get lead error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch lead'
    }, { status: 500 })
  }
}

// PUT /api/v1/connection/leads/[id]
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
    const validation = updateLeadSchema.safeParse(body)

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

    // 5. Update lead with tenant isolation
    const updatedLead = await withTenantContext(db, tenantContext, async (tx) => {
      // First verify lead belongs to tenant
      const existingLead = await tx.lead.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existingLead) {
        throw new Error('NOT_FOUND')
      }

      // Verify new pipeline if provided
      if (validation.data.pipelineId) {
        const pipeline = await tx.pipeline.findFirst({
          where: {
            id: validation.data.pipelineId,
            tenantId: user.tenantId
          }
        })

        if (!pipeline) {
          throw new Error('INVALID_PIPELINE')
        }
      }

      // Verify new stage if provided
      if (validation.data.stageId) {
        const pipelineId = validation.data.pipelineId || existingLead.pipelineId
        const stage = await tx.pipelineStage.findFirst({
          where: {
            id: validation.data.stageId,
            pipelineId
          }
        })

        if (!stage) {
          throw new Error('INVALID_STAGE')
        }
      }

      // Verify contact if provided
      if (validation.data.contactId) {
        const contact = await tx.contact.findFirst({
          where: {
            id: validation.data.contactId,
            tenantId: user.tenantId
          }
        })

        if (!contact) {
          throw new Error('INVALID_CONTACT')
        }
      }

      // Update lead
      return await tx.lead.update({
        where: { id: params.id },
        data: {
          ...validation.data,
          tags: validation.data.tags !== undefined ? JSON.stringify(validation.data.tags) : undefined,
          customFields: validation.data.customFields !== undefined ? JSON.stringify(validation.data.customFields) : undefined,
          expectedCloseDate: validation.data.expectedCloseDate ? new Date(validation.data.expectedCloseDate) : undefined,
          actualCloseDate: validation.data.actualCloseDate ? new Date(validation.data.actualCloseDate) : undefined
        },
        include: {
          pipeline: true,
          stage: true,
          contact: true
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: updatedLead,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Update lead error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Lead not found'
      }, { status: 404 })
    }

    if (error instanceof Error && (error.message === 'INVALID_PIPELINE' || error.message === 'INVALID_STAGE' || error.message === 'INVALID_CONTACT')) {
      return NextResponse.json({
        success: false,
        error: error.message === 'INVALID_PIPELINE' ? 'Pipeline not found' : error.message === 'INVALID_STAGE' ? 'Stage not found' : 'Contact not found'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to update lead'
    }, { status: 500 })
  }
}

// DELETE /api/v1/connection/leads/[id]
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

    // 4. Delete lead with tenant isolation
    await withTenantContext(db, tenantContext, async (tx) => {
      // Check if lead exists and belongs to tenant
      const existingLead = await tx.lead.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existingLead) {
        throw new Error('NOT_FOUND')
      }

      // Delete lead
      await tx.lead.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Lead deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Delete lead error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Lead not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to delete lead'
    }, { status: 500 })
  }
}
