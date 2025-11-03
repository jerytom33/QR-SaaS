import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'
import { randomBytes, createHash } from 'crypto'

/**
 * API Keys API Routes
 * Handles CRUD operations for API keys with multi-tenant isolation
 * API keys are hashed on storage for security
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

// Generate a secure API key
function generateApiKey(): { key: string; prefix: string } {
  const buffer = randomBytes(32)
  const key = buffer.toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 40)
  const prefix = key.substring(0, 6)
  return { key, prefix }
}

// Hash an API key for storage
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

const apiKeyCreateSchema = z.object({
  name: z.string().min(1, 'API key name required').max(255),
  permissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional()
})

const apiKeyUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional()
})

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional()
})

// GET - List API keys (returns metadata only, never the actual keys)
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
    const [apiKeys, total] = await withTenantContext(db, tenantContext, async (tx) => {
      const where = search
        ? {
            tenantId: user.tenantId,
            name: { contains: search, mode: 'insensitive' as const }
          }
        : { tenantId: user.tenantId }

      return await Promise.all([
        tx.apiKey.findMany({
          where,
          skip,
          take: limit,
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
            // Never select keyHash
          },
          orderBy: { createdAt: 'desc' }
        }),
        tx.apiKey.count({ where })
      ])
    })

    return NextResponse.json(
      {
        success: true,
        data: apiKeys,
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
    console.error('GET /api-keys error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new API key
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
    const validation = apiKeyCreateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        message: validation.error.message
      }, { status: 400 })
    }

    // 5. Generate and hash the API key
    const { key, prefix } = generateApiKey()
    const keyHash = hashApiKey(key)

    // 6. Create API key with RLS
    const apiKey = await withTenantContext(db, tenantContext, async (tx) => {
      // Check for duplicate name per tenant
      const existing = await tx.apiKey.findFirst({
        where: {
          tenantId: user.tenantId,
          name: validation.data.name
        }
      })

      if (existing) {
        throw new Error('DUPLICATE_NAME')
      }

      // Create new API key
      return await tx.apiKey.create({
        data: {
          name: validation.data.name,
          keyHash,
          keyPrefix: prefix,
          permissions: validation.data.permissions ? JSON.stringify(validation.data.permissions) : null,
          expiresAt: validation.data.expiresAt ? new Date(validation.data.expiresAt) : null,
          tenantId: user.tenantId,
          createdBy: user.id
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          permissions: true,
          isActive: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true
        }
      })
    })

    // Return the key ONLY on creation (never again)
    const response = {
      ...apiKey,
      key: key, // Only return the unhashed key once
      message: 'Store this key safely - you will not be able to view it again'
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
    console.error('POST /api-keys error:', error)
    if (error.message === 'DUPLICATE_NAME') {
      return NextResponse.json({
        success: false,
        error: 'API key with this name already exists',
        message: 'API key name must be unique per tenant'
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
      message: 'Use PUT /api-keys/[id] for individual updates'
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
      message: 'Use DELETE /api-keys/[id] for individual deletion'
    },
    { status: 400 }
  )
}
