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

  // Extract user from JWT or session
  // For now, return a mock user - in production, decode JWT
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

const createCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

const updateCompanySchema = createCompanySchema.partial()

// GET /api/v1/connection/companies
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
    const [companies, total] = await withTenantContext(db, tenantContext, async (tx) => {
      const where = search
        ? {
            tenantId: user.tenantId,
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { domain: { contains: search, mode: 'insensitive' as const } },
              { industry: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : { tenantId: user.tenantId }

      return await Promise.all([
        tx.company.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { contacts: true } } }
        }),
        tx.company.count({ where })
      ])
    })

    return NextResponse.json({
      success: true,
      data: companies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Get companies error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch companies'
    }, { status: 500 })
  }
}

// POST /api/v1/connection/companies
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
    const validation = createCompanySchema.safeParse(body)

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

    // 5. Create with RLS wrapper
    const company = await withTenantContext(db, tenantContext, async (tx) => {
      // Check for duplicate domain if provided
      if (validation.data.domain) {
        const existingDomain = await tx.company.findFirst({
          where: {
            domain: validation.data.domain,
            tenantId: user.tenantId
          }
        })

        if (existingDomain) {
          throw new Error('DUPLICATE_DOMAIN')
        }
      }

      return await tx.company.create({
        data: {
          ...validation.data,
          tags: validation.data.tags ? JSON.stringify(validation.data.tags) : undefined,
          customFields: validation.data.customFields ? JSON.stringify(validation.data.customFields) : undefined,
          tenantId: user.tenantId
        },
        include: { _count: { select: { contacts: true } } }
      })
    })

    return NextResponse.json({
      success: true,
      data: company,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Create company error:', error)

    if (error instanceof Error && error.message === 'DUPLICATE_DOMAIN') {
      return NextResponse.json({
        success: false,
        error: 'A company with this domain already exists'
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to create company'
    }, { status: 500 })
  }
}

// PUT /api/v1/connection/companies
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

    // 4. Get ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Company ID is required'
      }, { status: 400 })
    }

    // 5. Parse and validate request body
    const body = await request.json()
    const validation = updateCompanySchema.safeParse(body)

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

    // 6. Update with RLS wrapper and ownership check
    const updatedCompany = await withTenantContext(db, tenantContext, async (tx) => {
      // Check if company exists and belongs to tenant
      const existingCompany = await tx.company.findFirst({
        where: {
          id,
          tenantId: user.tenantId
        }
      })

      if (!existingCompany) {
        throw new Error('NOT_FOUND')
      }

      // Check for duplicate domain if updating domain
      if (validation.data.domain && validation.data.domain !== existingCompany.domain) {
        const duplicateDomain = await tx.company.findFirst({
          where: {
            domain: validation.data.domain,
            tenantId: user.tenantId,
            NOT: { id }
          }
        })

        if (duplicateDomain) {
          throw new Error('DUPLICATE_DOMAIN')
        }
      }

      return await tx.company.update({
        where: { id },
        data: {
          ...validation.data,
          tags: validation.data.tags !== undefined ? JSON.stringify(validation.data.tags) : undefined,
          customFields: validation.data.customFields !== undefined ? JSON.stringify(validation.data.customFields) : undefined
        },
        include: { _count: { select: { contacts: true } } }
      })
    })

    return NextResponse.json({
      success: true,
      data: updatedCompany,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Update company error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Company not found'
      }, { status: 404 })
    }

    if (error instanceof Error && error.message === 'DUPLICATE_DOMAIN') {
      return NextResponse.json({
        success: false,
        error: 'A company with this domain already exists'
      }, { status: 409 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to update company'
    }, { status: 500 })
  }
}

// DELETE /api/v1/connection/companies
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

    // 4. Get company ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Company ID is required'
      }, { status: 400 })
    }

    // 5. Execute with tenant isolation
    await withTenantContext(db, tenantContext, async (tx) => {
      // Check if company exists and belongs to tenant
      const existingCompany = await tx.company.findFirst({
        where: {
          id,
          tenantId: user.tenantId
        }
      })

      if (!existingCompany) {
        throw new Error('NOT_FOUND')
      }

      // Delete company (cascades to contacts via SetNull on companyId)
      await tx.company.delete({
        where: { id }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Company deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Company deletion error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Company not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to delete company'
    }, { status: 500 })
  }
}
