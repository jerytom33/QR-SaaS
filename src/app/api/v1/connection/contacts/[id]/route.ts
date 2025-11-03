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

const updateContactSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

// GET /api/v1/connection/contacts/[id]
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

    // 4. Get contact with tenant isolation
    const contact = await withTenantContext(db, tenantContext, async (tx) => {
      return await tx.contact.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        },
        include: {
          company: true
        }
      })
    })

    if (!contact) {
      return NextResponse.json({
        success: false,
        error: 'Contact not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: contact,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Get contact error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch contact'
    }, { status: 500 })
  }
}

// PUT /api/v1/connection/contacts/[id]
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
    const validation = updateContactSchema.safeParse(body)

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

    // 5. Update contact with tenant isolation
    const updatedContact = await withTenantContext(db, tenantContext, async (tx) => {
      // First verify contact belongs to tenant
      const existingContact = await tx.contact.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existingContact) {
        throw new Error('NOT_FOUND')
      }

      // Update contact
      return await tx.contact.update({
        where: { id: params.id },
        data: {
          firstName: validation.data.firstName,
          lastName: validation.data.lastName,
          email: validation.data.email,
          phone: validation.data.phone,
          title: validation.data.title,
          notes: validation.data.notes,
          tags: validation.data.tags,
          customFields: validation.data.customFields,
          // Handle company update if provided
          ...(validation.data.company && {
            company: {
              connect: { id: validation.data.company }
            }
          })
        },
        include: { company: true }
      })
    })

    return NextResponse.json({
      success: true,
      data: updatedContact,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Update contact error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Contact not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to update contact'
    }, { status: 500 })
  }
}

// DELETE /api/v1/connection/contacts/[id]
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

    // 4. Delete contact with tenant isolation
    await withTenantContext(db, tenantContext, async (tx) => {
      // Check if contact exists and belongs to tenant
      const existingContact = await tx.contact.findFirst({
        where: {
          id: params.id,
          tenantId: user.tenantId
        }
      })

      if (!existingContact) {
        throw new Error('NOT_FOUND')
      }

      // Delete contact
      await tx.contact.delete({
        where: { id: params.id }
      })
    })

    return NextResponse.json({
      success: true,
      message: 'Contact deleted successfully',
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Delete contact error:', error)

    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Contact not found'
      }, { status: 404 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to delete contact'
    }, { status: 500 })
  }
}
