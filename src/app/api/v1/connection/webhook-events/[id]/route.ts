import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Webhook Events Dynamic Route - Phase 2.1i
 * Handles individual webhook event retrieval, retry scheduling, and deletion
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
    role
  }
}

// ========================================================================
// GET /api/v1/connection/webhook-events/[id]
// Retrieve individual webhook event with delivery history
// ========================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Fetch webhook event
    const event = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhookEvent.findUnique({
        where: { id: params.id },
        include: {
          webhook: {
            select: {
              id: true,
              name: true,
              url: true,
              isActive: true
            }
          }
        }
      })
    })

    if (!event) {
      return NextResponse.json(
        { error: 'Webhook event not found' },
        { status: 404 }
      )
    }

    if (event.tenantId !== authUser.tenantId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    return NextResponse.json({
      success: true,
      data: event,
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('GET /webhook-events/[id] error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ========================================================================
// PUT /api/v1/connection/webhook-events/[id]
// Update event status or schedule retry
// ========================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      status: z.enum(['PENDING', 'DELIVERED', 'FAILED', 'RETRYING']).optional(),
      lastAttemptError: z.string().optional(),
      nextRetryAt: z.string().datetime().optional(),
      retryDelaySeconds: z.number().int().min(1).max(3600).optional(),
      scheduleRetry: z.boolean().optional()
    })
    const data = schema.parse(body)

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Update webhook event
    const event = await withTenantContext(db, tenantContext, async (tx) => {
      // Verify event exists and belongs to tenant
      const existing = await tx.webhookEvent.findUnique({
        where: { id: params.id }
      })

      if (!existing) {
        throw new Error('Event not found')
      }

      if (existing.tenantId !== authUser.tenantId) {
        throw new Error('Forbidden')
      }

      // Build update data
      const updateData: any = {
        updatedAt: new Date()
      }

      if (data.status) {
        updateData.status = data.status
      }

      if (data.lastAttemptError) {
        updateData.lastAttemptError = data.lastAttemptError
      }

      if (data.scheduleRetry && data.retryDelaySeconds) {
        updateData.status = 'RETRYING'
        updateData.nextRetryAt = new Date(Date.now() + data.retryDelaySeconds * 1000)
      }

      if (data.nextRetryAt) {
        updateData.nextRetryAt = new Date(data.nextRetryAt)
      }

      return tx.webhookEvent.update({
        where: { id: params.id },
        data: updateData,
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
    })

    return NextResponse.json({
      success: true,
      data: event,
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('PUT /webhook-events/[id] error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }
    if (error instanceof Error) {
      if (error.message === 'Event not found') {
        return NextResponse.json(
          { error: 'Webhook event not found' },
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
// DELETE /api/v1/connection/webhook-events/[id]
// Delete individual webhook event
// ========================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Delete webhook event
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Verify event exists and belongs to tenant
      const existing = await tx.webhookEvent.findUnique({
        where: { id: params.id }
      })

      if (!existing) {
        throw new Error('Event not found')
      }

      if (existing.tenantId !== authUser.tenantId) {
        throw new Error('Forbidden')
      }

      return tx.webhookEvent.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        id: result.id,
        message: 'Webhook event deleted'
      },
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('DELETE /webhook-events/[id] error:', error)
    if (error instanceof Error) {
      if (error.message === 'Event not found') {
        return NextResponse.json(
          { error: 'Webhook event not found' },
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
