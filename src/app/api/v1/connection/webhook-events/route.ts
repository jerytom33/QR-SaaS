import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Webhook Events API - Phase 2.1i
 * Manages event delivery tracking, retry management, delivery logs, and status filtering
 * Supports delivery history, failure tracking, and retry queuing
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
    role
  }
}

// ========================================================================
// SCHEMAS
// ========================================================================

const webhookEventListSchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  webhookId: z.string().optional(),
  status: z.enum(['PENDING', 'DELIVERED', 'FAILED', 'RETRYING']).optional(),
  search: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional()
})

const createWebhookEventSchema = z.object({
  webhookId: z.string().min(1),
  eventType: z.string().min(1),
  entityType: z.enum(['CONTACT', 'COMPANY', 'LEAD', 'PIPELINE', 'STAGE']),
  entityId: z.string().min(1),
  payload: z.record(z.string(), z.any()),
  triggedBy: z.string().optional()
})

const updateWebhookEventSchema = z.object({
  ids: z.array(z.string()).min(1),
  status: z.enum(['PENDING', 'DELIVERED', 'FAILED', 'RETRYING']).optional(),
  lastAttemptError: z.string().optional(),
  nextRetryAt: z.string().datetime().optional()
})

const retryEventSchema = z.object({
  ids: z.array(z.string()).min(1),
  delaySeconds: z.number().int().min(1).max(3600).optional().default(60)
})

// ========================================================================
// GET /api/v1/connection/webhook-events
// ========================================================================

export async function GET(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = await authenticatedRateLimiter(request)
    if (rateLimitResponse) return rateLimitResponse

    // Authentication
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const queryParams = webhookEventListSchema.parse({
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      webhookId: searchParams.get('webhookId'),
      status: searchParams.get('status'),
      search: searchParams.get('search'),
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo')
    })

    const page = parseInt(queryParams.page)
    const limit = Math.min(parseInt(queryParams.limit), 100)
    const skip = (page - 1) * limit

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Fetch webhook events with filtering
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Build where clause
      const where: any = {
        tenantId: authUser.tenantId,
        webhook: {
          tenantId: authUser.tenantId
        }
      }

      if (queryParams.webhookId) {
        where.webhookId = queryParams.webhookId
      }

      if (queryParams.status) {
        where.status = queryParams.status
      }

      if (queryParams.search) {
        where.OR = [
          { eventType: { contains: queryParams.search, mode: 'insensitive' } },
          { entityType: { contains: queryParams.search, mode: 'insensitive' } },
          { entityId: { contains: queryParams.search, mode: 'insensitive' } }
        ]
      }

      if (queryParams.dateFrom) {
        where.createdAt = { gte: new Date(queryParams.dateFrom) }
      }

      if (queryParams.dateTo) {
        where.createdAt = {
          ...where.createdAt,
          lte: new Date(queryParams.dateTo)
        }
      }

      // Fetch events and count
      const [events, total] = await Promise.all([
        tx.webhookEvent.findMany({
          where,
          include: {
            webhook: {
              select: {
                id: true,
                name: true,
                url: true,
                isActive: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        tx.webhookEvent.count({ where })
      ])

      return {
        events,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasMore: skip + limit < total
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: result.events,
      metadata: {
        ...result.pagination,
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('GET /webhook-events error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request parameters' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ========================================================================
// POST /api/v1/connection/webhook-events
// Create webhook event for delivery
// ========================================================================

export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = await authenticatedRateLimiter(request)
    if (rateLimitResponse) return rateLimitResponse

    // Authentication
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const data = createWebhookEventSchema.parse(body)

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Create webhook event
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Verify webhook exists and belongs to tenant
      const webhook = await tx.webhook.findUnique({
        where: { id: data.webhookId }
      })

      if (!webhook) {
        throw new Error('Webhook not found')
      }

      if (webhook.tenantId !== authUser.tenantId) {
        throw new Error('Forbidden')
      }

      // Create webhook event
      const event = await tx.webhookEvent.create({
        data: {
          tenantId: authUser.tenantId,
          webhookId: data.webhookId,
          eventType: data.eventType,
          entityType: data.entityType,
          entityId: data.entityId,
          payload: data.payload,
          status: 'PENDING',
          attempts: 0,
          nextRetryAt: new Date(),
          triggeredBy: data.triggedBy || authUser.id,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          webhook: {
            select: {
              id: true,
              name: true,
              url: true
            }
          }
        }
      })

      return event
    })

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    }, { status: 201 })
  } catch (error) {
    console.error('POST /webhook-events error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }
    if (error instanceof Error) {
      if (error.message === 'Webhook not found') {
        return NextResponse.json(
          { error: 'Webhook not found' },
          { status: 404 }
        )
      }
      if (error.message === 'Forbidden') {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ========================================================================
// PUT /api/v1/connection/webhook-events
// Batch update event status and retry information
// ========================================================================

export async function PUT(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = await authenticatedRateLimiter(request)
    if (rateLimitResponse) return rateLimitResponse

    // Authentication
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const data = updateWebhookEventSchema.parse(body)

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Update webhook events
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      const updateData: any = {
        updatedAt: new Date()
      }

      if (data.status) {
        updateData.status = data.status
      }

      if (data.lastAttemptError) {
        updateData.lastAttemptError = data.lastAttemptError
      }

      if (data.nextRetryAt) {
        updateData.nextRetryAt = new Date(data.nextRetryAt)
      }

      const result = await tx.webhookEvent.updateMany({
        where: {
          id: { in: data.ids },
          tenantId: authUser.tenantId
        },
        data: updateData
      })

      return result
    })

    return NextResponse.json({
      success: true,
      data: {
        updated: result.count
      },
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('PUT /webhook-events error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ========================================================================
// DELETE /api/v1/connection/webhook-events
// Batch delete webhook events
// ========================================================================

export async function DELETE(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimitResponse = await authenticatedRateLimiter(request)
    if (rateLimitResponse) return rateLimitResponse

    // Authentication
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const schema = z.object({
      ids: z.array(z.string()).min(1)
    })
    const data = schema.parse(body)

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Delete webhook events
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhookEvent.deleteMany({
        where: {
          id: { in: data.ids },
          tenantId: authUser.tenantId
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        deleted: result.count
      },
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('DELETE /webhook-events error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
