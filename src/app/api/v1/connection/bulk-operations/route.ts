import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Bulk Operations API - Phase 2.1j
 * Supports batch creation, updates, and deletion of entities with transaction support
 * Ensures atomic operations with rollback on error
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
// SCHEMAS
// ========================================================================

const bulkEntitySchema = z.object({
  type: z.enum(['CONTACT', 'COMPANY', 'LEAD']),
  operation: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  id: z.string().optional(),
  data: z.record(z.string(), z.any()).optional()
})

const bulkOperationSchema = z.object({
  entities: z.array(bulkEntitySchema).min(1).max(100),
  continueOnError: z.boolean().optional().default(false)
})

const bulkOperationStatusSchema = z.object({
  id: z.string().optional()
})

// ========================================================================
// POST /api/v1/connection/bulk-operations
// Execute batch CRUD operations
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
    const data = bulkOperationSchema.parse(body)

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Execute bulk operations
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      const results: any[] = []
      const errors: any[] = []
      let operationId = `bulk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      for (let i = 0; i < data.entities.length; i++) {
        const entity = data.entities[i]

        try {
          let operationResult: any = null

          if (entity.type === 'CONTACT') {
            if (entity.operation === 'CREATE') {
              operationResult = await tx.contact.create({
                data: {
                  tenantId: authUser.tenantId,
                  ...entity.data
                }
              })
            } else if (entity.operation === 'UPDATE' && entity.id) {
              operationResult = await tx.contact.update({
                where: { id: entity.id },
                data: entity.data
              })
            } else if (entity.operation === 'DELETE' && entity.id) {
              operationResult = await tx.contact.delete({
                where: { id: entity.id }
              })
            }
          } else if (entity.type === 'COMPANY') {
            if (entity.operation === 'CREATE') {
              operationResult = await tx.company.create({
                data: {
                  tenantId: authUser.tenantId,
                  ...entity.data
                }
              })
            } else if (entity.operation === 'UPDATE' && entity.id) {
              operationResult = await tx.company.update({
                where: { id: entity.id },
                data: entity.data
              })
            } else if (entity.operation === 'DELETE' && entity.id) {
              operationResult = await tx.company.delete({
                where: { id: entity.id }
              })
            }
          } else if (entity.type === 'LEAD') {
            if (entity.operation === 'CREATE') {
              operationResult = await tx.lead.create({
                data: {
                  tenantId: authUser.tenantId,
                  ...entity.data
                }
              })
            } else if (entity.operation === 'UPDATE' && entity.id) {
              operationResult = await tx.lead.update({
                where: { id: entity.id },
                data: entity.data
              })
            } else if (entity.operation === 'DELETE' && entity.id) {
              operationResult = await tx.lead.delete({
                where: { id: entity.id }
              })
            }
          }

          results.push({
            index: i,
            status: 'SUCCESS',
            type: entity.type,
            operation: entity.operation,
            result: operationResult
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          errors.push({
            index: i,
            status: 'FAILED',
            type: entity.type,
            operation: entity.operation,
            error: errorMessage
          })

          if (!data.continueOnError) {
            throw new Error(`Batch operation failed at index ${i}: ${errorMessage}`)
          }
        }
      }

      return {
        operationId,
        totalRequested: data.entities.length,
        succeeded: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined
      }
    })

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    }, { status: 207 })
  } catch (error) {
    console.error('POST /bulk-operations error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      )
    }
    if (error instanceof Error) {
      if (error.message.startsWith('Batch operation failed')) {
        return NextResponse.json(
          { error: error.message, success: false },
          { status: 422 }
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
// GET /api/v1/connection/bulk-operations
// Retrieve bulk operation history and status
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
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Return mock bulk operation history
    const operations = [
      {
        id: 'bulk-1234567890-abc123',
        tenantId: authUser.tenantId,
        status: 'COMPLETED',
        totalRequested: 10,
        succeeded: 10,
        failed: 0,
        createdAt: new Date(Date.now() - 3600000),
        completedAt: new Date(Date.now() - 3595000)
      },
      {
        id: 'bulk-0987654321-def456',
        tenantId: authUser.tenantId,
        status: 'COMPLETED',
        totalRequested: 25,
        succeeded: 24,
        failed: 1,
        createdAt: new Date(Date.now() - 7200000),
        completedAt: new Date(Date.now() - 7195000)
      }
    ]

    return NextResponse.json({
      success: true,
      data: operations,
      metadata: {
        page,
        limit,
        total: operations.length,
        hasMore: false,
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('GET /bulk-operations error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
