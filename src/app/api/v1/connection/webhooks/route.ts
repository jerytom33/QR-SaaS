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

const createWebhookSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  url: z.string().url('Invalid URL format'),
  events: z.array(z.enum(['contact.created', 'contact.updated', 'contact.deleted', 'company.created', 'company.updated', 'company.deleted', 'lead.created', 'lead.updated', 'lead.deleted'])).min(1),
  isActive: z.boolean().default(true),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelaySeconds: z.number().int().min(1).max(3600).default(60),
})

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  url: z.string().url().optional(),
  events: z.array(z.enum(['contact.created', 'contact.updated', 'contact.deleted', 'company.created', 'company.updated', 'company.deleted', 'lead.created', 'lead.updated', 'lead.deleted'])).min(1).optional(),
  isActive: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryDelaySeconds: z.number().int().min(1).max(3600).optional(),
})

const webhookListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
})

// ============================================================================
// GET: List Webhooks
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
    const filters = webhookListSchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      isActive: searchParams.get('isActive'),
      search: searchParams.get('search'),
    })

    const offset = (filters.page - 1) * filters.limit

    // Build where clause
    const where: any = {
      tenantId: user.tenantId,
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive === 'true'
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { url: { contains: filters.search, mode: 'insensitive' } }
      ]
    }

    // 5. Execute with tenant isolation
    const [webhooks, total] = await withTenantContext(db, tenantContext, async (tx) => {
      return await Promise.all([
        tx.webhook.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: filters.limit,
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
        }),
        tx.webhook.count({ where })
      ])
    })

    return NextResponse.json({
      success: true,
      data: {
        webhooks,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pages: Math.ceil(total / filters.limit)
        }
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
        error: 'Invalid query parameters'
      }, { status: 400 })
    }
    console.error('Webhooks GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch webhooks'
    }, { status: 500 })
  }
}

// ============================================================================
// POST: Create Webhook
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
    const validatedData = createWebhookSchema.parse(body)

    // Validate URL
    if (!validateUrl(validatedData.url)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid webhook URL'
      }, { status: 400 })
    }

    // 5. Generate webhook secret
    const { secret, hash } = generateWebhookSecret()

    // 6. Create webhook with RLS
    const webhook = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhook.create({
        data: {
          tenantId: user.tenantId,
          name: validatedData.name,
          url: validatedData.url,
          events: validatedData.events,
          secretHash: hash,
          isActive: validatedData.isActive,
          maxRetries: validatedData.maxRetries,
          retryDelaySeconds: validatedData.retryDelaySeconds,
        },
        select: {
          id: true,
          name: true,
          url: true,
          events: true,
          isActive: true,
          maxRetries: true,
          retryDelaySeconds: true,
          createdAt: true,
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: {
        webhook,
        secret: secret // Only shown on creation
      },
      message: 'Webhook created successfully. Save the secret securely.',
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
    console.error('Webhooks POST error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create webhook'
    }, { status: 500 })
  }
}

// ============================================================================
// PUT: Update Webhooks (batch operations)
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
      data: updateWebhookSchema
    }).parse(body)

    // Validate URL if provided
    if (data.url && !validateUrl(data.url)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid webhook URL'
      }, { status: 400 })
    }

    // 5. Update with RLS
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      return tx.webhook.updateMany({
        where: {
          id: { in: ids },
          tenantId: user.tenantId
        },
        data: {
          name: data.name,
          url: data.url,
          events: data.events,
          isActive: data.isActive,
          maxRetries: data.maxRetries,
          retryDelaySeconds: data.retryDelaySeconds,
        }
      })
    })

    return NextResponse.json({
      success: true,
      message: `Updated ${result.count} webhook(s)`,
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
    console.error('Webhooks PUT error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update webhooks'
    }, { status: 500 })
  }
}

// ============================================================================
// DELETE: Delete Webhooks (batch operations)
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
      return tx.webhook.deleteMany({
        where: {
          id: { in: ids },
          tenantId: user.tenantId
        }
      })
    })

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} webhook(s)`,
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
    console.error('Webhooks DELETE error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to delete webhooks'
    }, { status: 500 })
  }
}
