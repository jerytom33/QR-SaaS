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

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
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

// GET /api/v1/connection/companies/[id]
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

    // 4. Get company with tenant isolation
    const company = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.company.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        },
        include: {
          _count: { select: { contacts: true } }
        }
      })
    })

    if (!company) {
      return NextResponse.json({
        success: false,
        error: 'Company not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: company,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Get company error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch company'
    }, { status: 500 })
  }
}

// PUT /api/v1/connection/companies/[id]
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

    // 5. Update company with tenant isolation
    const updatedCompany = await withTenantContext(db, tenantContext, async (tx) => {
      // First verify company belongs to tenant
      const existingCompany = await tx.company.findFirst({
        where: {
          id: params.id,
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
            NOT: { id: params.id }
          }
        })

        if (duplicateDomain) {
          throw new Error('DUPLICATE_DOMAIN')
        }
      }

      // Update company
      return await tx.company.update({
        where: { id: params.id },
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

// DELETE /api/v1/connection/companies/[id]
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

    // 4. Delete company with tenant isolation
    await withTenantContext(db, tenantContext, async (tx) => {
      // Check if company exists and belongs to tenant
      const existingCompany = await tx.company.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existingCompany) {
        throw new Error('NOT_FOUND')
      }

      // Delete company
      await tx.company.delete({
        where: { id: params.id }
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
    console.error('Delete company error:', error)

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
