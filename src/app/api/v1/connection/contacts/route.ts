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

const createContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
})

const updateContactSchema = createContactSchema.partial()

// GET /api/v1/connection/contacts
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
    const offset = (page - 1) * limit

    // Build where clause for tenant isolation
    const where: any = {
      tenantId: user.tenantId,
      ...(search && {
        OR: [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } }
        ]
      })
    }

    // 5. Execute with tenant isolation
    const [contacts, total] = await withTenantContext(db, tenantContext, async (tx) => {
      return await Promise.all([
        tx.contact.findMany({
          where,
          include: {
            company: true
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit
        }),
        tx.contact.count({ where })
      ])
    })

    return NextResponse.json({
      success: true,
      data: {
        contacts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Contacts GET error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch contacts'
    }, { status: 500 })
  }
}

// POST /api/v1/connection/contacts
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
    const validatedData = createContactSchema.parse(body)

    // 5. Execute with tenant isolation
    const contact = await withTenantContext(db, tenantContext, async (tx) => {
      // Check if contact with email already exists
      if (validatedData.email) {
        const existingContact = await tx.contact.findFirst({
          where: {
            email: validatedData.email,
            tenantId: user.tenantId
          }
        })

        if (existingContact) {
          throw new Error('Contact with this email already exists')
        }
      }

      // Create or find company
      let companyId: string | null = null
      if (validatedData.company) {
        const company = await tx.company.findFirst({
          where: {
            name: validatedData.company,
            tenantId: user.tenantId
          }
        })

        if (company) {
          companyId = company.id
        } else {
          const newCompany = await tx.company.create({
            data: {
              name: validatedData.company,
              tenantId: user.tenantId
            }
          })
          companyId = newCompany.id
        }
      }

      // Create contact
      return await tx.contact.create({
        data: {
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          email: validatedData.email || null,
          phone: validatedData.phone || null,
          title: validatedData.title || null,
          notes: validatedData.notes || null,
          tags: validatedData.tags ? JSON.stringify(validatedData.tags) : null,
          customFields: validatedData.customFields ? JSON.stringify(validatedData.customFields) : null,
          tenantId: user.tenantId,
          companyId
        },
        include: {
          company: true
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: contact,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Contact creation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }, { status: 400 })
    }

    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return NextResponse.json({
          success: false,
          error: error.message
        }, { status: 409 })
      }
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to create contact'
    }, { status: 500 })
  }
}

// PUT /api/v1/connection/contacts
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

    // 4. Parse request
    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Contact ID is required'
      }, { status: 400 })
    }

    const validatedData = updateContactSchema.parse(updateData)

    // 5. Execute with tenant isolation
    const contact = await withTenantContext(db, tenantContext, async (tx) => {
      // Check if contact exists and belongs to tenant
      const existingContact = await tx.contact.findFirst({
        where: {
          id,
          tenantId: user.tenantId
        }
      })

      if (!existingContact) {
        throw new Error('NOT_FOUND')
      }

      // Handle company update
      let companyId: string | null = existingContact.companyId

      if (validatedData.company) {
        const company = await tx.company.findFirst({
          where: {
            name: validatedData.company,
            tenantId: user.tenantId
          }
        })

        if (company) {
          companyId = company.id
        } else {
          const newCompany = await tx.company.create({
            data: {
              name: validatedData.company,
              tenantId: user.tenantId
            }
          })
          companyId = newCompany.id
        }
      }

      // Update contact
      return await tx.contact.update({
        where: { id },
        data: {
          firstName: validatedData.firstName ?? existingContact.firstName,
          lastName: validatedData.lastName ?? existingContact.lastName,
          email: validatedData.email ?? existingContact.email,
          phone: validatedData.phone ?? existingContact.phone,
          title: validatedData.title ?? existingContact.title,
          notes: validatedData.notes ?? existingContact.notes,
          tags: validatedData.tags ? JSON.stringify(validatedData.tags) : existingContact.tags,
          customFields: validatedData.customFields ? JSON.stringify(validatedData.customFields) : existingContact.customFields,
          companyId
        },
        include: {
          company: true
        }
      })
    })

    return NextResponse.json({
      success: true,
      data: contact,
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: uuidv4()
      }
    })

  } catch (error) {
    console.error('Contact update error:', error)
    
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({
        success: false,
        error: 'Contact not found'
      }, { status: 404 })
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to update contact'
    }, { status: 500 })
  }
}

// DELETE /api/v1/connection/contacts
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

    // 4. Get contact ID from query params
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Contact ID is required'
      }, { status: 400 })
    }

    // 5. Execute with tenant isolation
    await withTenantContext(db, tenantContext, async (tx) => {
      // Check if contact exists and belongs to tenant
      const existingContact = await tx.contact.findFirst({
        where: {
          id,
          tenantId: user.tenantId
        }
      })

      if (!existingContact) {
        throw new Error('NOT_FOUND')
      }

      // Delete contact
      await tx.contact.delete({
        where: { id }
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
    console.error('Contact deletion error:', error)

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