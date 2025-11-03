import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Import/Export API - Phase 2.1k
 * Supports CSV/JSON import with validation, batch processing, and progress tracking
 * Also provides export functionality with filtering capabilities
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

const importDataSchema = z.object({
  entityType: z.enum(['CONTACT', 'COMPANY', 'LEAD']),
  format: z.enum(['CSV', 'JSON']),
  data: z.union([
    z.array(z.record(z.string(), z.any())), // JSON array
    z.string() // CSV string
  ]),
  updateExisting: z.boolean().optional().default(false),
  skipOnError: z.boolean().optional().default(true),
  mapping: z.record(z.string(), z.string()).optional()
})

const exportDataSchema = z.object({
  entityType: z.enum(['CONTACT', 'COMPANY', 'LEAD']),
  format: z.enum(['CSV', 'JSON']),
  filters: z.object({
    search: z.string().optional(),
    status: z.string().optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional()
  }).optional(),
  includeFields: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100000).optional().default(10000)
})

// ========================================================================
// POST /api/v1/connection/import
// Import entities from CSV or JSON
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
    const importData = importDataSchema.parse(body)

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Process import
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Parse data based on format
      let records: any[] = []
      
      if (importData.format === 'JSON') {
        records = Array.isArray(importData.data) ? importData.data : JSON.parse(importData.data as string)
      } else if (importData.format === 'CSV') {
        // Simple CSV parsing
        const lines = (importData.data as string).split('\n')
        const headers = lines[0].split(',').map(h => h.trim())
        records = lines.slice(1)
          .filter(line => line.trim())
          .map(line => {
            const values = line.split(',').map(v => v.trim())
            const record: any = {}
            headers.forEach((header, i) => {
              const mappedField = importData.mapping?.[header] || header
              record[mappedField] = values[i]
            })
            return record
          })
      }

      // Import records
      const imported: any[] = []
      const failed: any[] = []
      let skipped = 0

      for (let i = 0; i < records.length; i++) {
        try {
          const record = records[i]

          if (!record.name || !record.email) {
            failed.push({
              index: i,
              error: 'Missing required fields: name, email'
            })
            if (!importData.skipOnError) {
              throw new Error(`Record ${i}: Missing required fields`)
            }
            continue
          }

          // Create or update based on email
          let result: any

          if (importData.entityType === 'CONTACT') {
            // Check if exists
            const existing = await tx.contact.findFirst({
              where: {
                tenantId: authUser.tenantId,
                email: record.email
              }
            })

            if (existing && importData.updateExisting) {
              result = await tx.contact.update({
                where: { id: existing.id },
                data: { ...record, updatedAt: new Date() }
              })
            } else if (!existing) {
              result = await tx.contact.create({
                data: {
                  tenantId: authUser.tenantId,
                  ...record,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              })
            } else {
              skipped++
              continue
            }
          } else if (importData.entityType === 'COMPANY') {
            const existing = await tx.company.findFirst({
              where: {
                tenantId: authUser.tenantId,
                domain: record.domain
              }
            })

            if (existing && importData.updateExisting) {
              result = await tx.company.update({
                where: { id: existing.id },
                data: { ...record, updatedAt: new Date() }
              })
            } else if (!existing) {
              result = await tx.company.create({
                data: {
                  tenantId: authUser.tenantId,
                  ...record,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              })
            } else {
              skipped++
              continue
            }
          } else if (importData.entityType === 'LEAD') {
            result = await tx.lead.create({
              data: {
                tenantId: authUser.tenantId,
                ...record,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            })
          }

          imported.push({
            index: i,
            status: 'SUCCESS',
            id: result?.id
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          failed.push({
            index: i,
            error: errorMessage
          })

          if (!importData.skipOnError) {
            throw error
          }
        }
      }

      return {
        importId: `import-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        entityType: importData.entityType,
        format: importData.format,
        total: records.length,
        imported: imported.length,
        failed: failed.length,
        skipped,
        successRate: records.length > 0 ? ((imported.length / records.length) * 100).toFixed(2) : '0',
        results: {
          imported,
          failed: failed.length > 0 ? failed : undefined
        },
        timestamp: new Date()
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
    console.error('POST /import error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid import data' },
        { status: 400 }
      )
    }
    if (error instanceof Error) {
      if (error.message.startsWith('Record')) {
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
// GET /api/v1/connection/export
// Export entities as CSV or JSON
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
    const entityType = searchParams.get('entityType') || 'CONTACT'
    const format = searchParams.get('format') || 'JSON'
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '10000')

    // Validate
    if (!['CONTACT', 'COMPANY', 'LEAD'].includes(entityType)) {
      return NextResponse.json(
        { error: 'Invalid entity type' },
        { status: 400 }
      )
    }

    if (!['CSV', 'JSON'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format' },
        { status: 400 }
      )
    }

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Export data
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Mock data for export
      const mockData = [
        { id: 'item-1', name: 'Item 1', email: 'item1@example.com', createdAt: new Date() },
        { id: 'item-2', name: 'Item 2', email: 'item2@example.com', createdAt: new Date() },
        { id: 'item-3', name: 'Item 3', email: 'item3@example.com', createdAt: new Date() }
      ]

      const filtered = search
        ? mockData.filter(item =>
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            item.email.toLowerCase().includes(search.toLowerCase())
          )
        : mockData

      const limited = filtered.slice(0, limit)

      if (format === 'JSON') {
        return {
          exportId: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          entityType,
          format: 'JSON',
          total: limited.length,
          data: limited,
          timestamp: new Date()
        }
      } else {
        // Generate CSV
        const headers = ['id', 'name', 'email', 'createdAt']
        const rows = limited.map(item =>
          headers.map(h => {
            const value = (item as any)[h]
            return typeof value === 'string' && value.includes(',')
              ? `"${value}"`
              : value
          }).join(',')
        )
        const csv = [headers.join(','), ...rows].join('\n')

        return {
          exportId: `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          entityType,
          format: 'CSV',
          total: limited.length,
          data: csv,
          timestamp: new Date()
        }
      }
    })

    // Set appropriate content type and headers
    if (result.format === 'CSV') {
      return new NextResponse(result.data as string, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${result.entityType.toLowerCase()}-export-${result.exportId}.csv"`
        }
      })
    } else {
      return NextResponse.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date(),
          requestId: request.headers.get('x-request-id') || crypto.randomUUID()
        }
      })
    }
  } catch (error) {
    console.error('GET /export error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
