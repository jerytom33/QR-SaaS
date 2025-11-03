import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'
import { createHash, randomBytes } from 'crypto'
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
// HELPER FUNCTIONS
// ============================================================================

function generateWebhookSecret(): { secret: string; hash: string } {
  const secret = randomBytes(32).toString('base64')
  const hash = createHash('sha256').update(secret).digest('hex')
  return { secret, hash }
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// ============================================================================
// SCHEMAS
// ============================================================================

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum(['contact.created', 'contact.updated', 'contact.deleted', 'company.created', 'company.updated', 'company.deleted', 'lead.created', 'lead.updated', 'lead.deleted'])).min(1).optional(),
  isActive: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryDelaySeconds: z.number().int().min(1).max(3600).optional(),
  rotateSecret: z.boolean().optional(),
})

// ============================================================================
// GET: Retrieve Individual Webhook
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

    // 4. Retrieve webhook with RLS
    const webhook = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhook.findUnique({
        where: { id: params.id }
      })
    })

    if (!webhook) {
      return NextResponse.json({
        success: false,
        error: 'Webhook not found'
      }, { status: 404 })
    }

    // Verify tenant ownership
    if (webhook.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    // Don't expose secretHash
    const { secretHash, ...webhookData } = webhook

    return NextResponse.json({
      success: true,
      data: {
        webhook: webhookData
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Webhook GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch webhook'
    }, { status: 500 })
  }
}

// ============================================================================
// PUT: Update Individual Webhook
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
    const validatedData = updateWebhookSchema.parse(body)

    // Validate URL if provided
    if (validatedData.url && !validateUrl(validatedData.url)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid webhook URL'
      }, { status: 400 })
    }

    // 5. Get current webhook to verify ownership
    const currentWebhook = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhook.findUnique({
        where: { id: params.id }
      })
    })

    if (!currentWebhook) {
      return NextResponse.json({
        success: false,
        error: 'Webhook not found'
      }, { status: 404 })
    }

    if (currentWebhook.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    // 6. Prepare update data
    const updateData: any = {
      name: validatedData.name,
      url: validatedData.url,
      events: validatedData.events,
      isActive: validatedData.isActive,
      maxRetries: validatedData.maxRetries,
      retryDelaySeconds: validatedData.retryDelaySeconds,
    }

    // Rotate secret if requested
    if (validatedData.rotateSecret) {
      const { secret: newSecret, hash } = generateWebhookSecret()
      updateData.secretHash = hash
    }

    // 7. Update webhook with RLS
    const updatedWebhook = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhook.update({
        where: { id: params.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          isActive: true,
          maxRetries: true,
          retryDelaySeconds: true,
          lastTriggeredAt: true,
          createdAt: true,
          updatedAt: true,
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        webhook: updatedWebhook
      },
      message: validatedData.rotateSecret ? 'Webhook updated and secret rotated' : 'Webhook updated successfully',
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
    console.error('Webhook PUT error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update webhook'
    }, { status: 500 })
  }
}

// ============================================================================
// DELETE: Delete Individual Webhook
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

    // 4. Get webhook to verify ownership
    const webhook = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhook.findUnique({
        where: { id: params.id }
      })
    })

    if (!webhook) {
      return NextResponse.json({
        success: false,
        error: 'Webhook not found'
      }, { status: 404 })
    }

    if (webhook.tenantId !== user.tenantId) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden'
      }, { status: 403 })
    }

    // 5. Delete webhook with RLS
    await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhook.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Webhook deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Webhook DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete webhook'
    }, { status: 500 })
  }
}
