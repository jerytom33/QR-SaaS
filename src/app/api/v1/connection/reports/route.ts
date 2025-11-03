import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

// Mock authentication functions
async function authenticatedRateLimiter(request: NextRequest) {
  return null
}

/**
 * Reports API - Phase 2.1m
 * Handles report generation, scheduling, delivery, and templates
 * GET: Retrieve reports with filtering
 * POST: Create new report with template + scheduling
 */

const createReportSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  type: z.enum(['CONTACTS_SUMMARY', 'COMPANIES_SUMMARY', 'LEADS_SUMMARY', 'PIPELINE_ANALYSIS', 'ACTIVITY_REPORT', 'CONVERSION_FUNNEL', 'CUSTOM']),
  templateId: z.string().uuid().optional(),
  templateName: z.string().max(255).optional(),
  metrics: z.array(z.string()).optional(),
  filters: z.record(z.string(), z.any()).optional(),
  schedule: z.object({
    type: z.enum(['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY']),
    scheduledFor: z.string().datetime().optional(),
    recurrencePattern: z.string().optional()
  }).optional(),
  recipients: z.array(z.string().email()).optional(),
  emailFormat: z.enum(['HTML', 'PDF']).optional(),
  includeCharts: z.boolean().optional()
})

const reportListSchema = z.object({
  search: z.string().max(255).optional(),
  type: z.enum(['CONTACTS_SUMMARY', 'COMPANIES_SUMMARY', 'LEADS_SUMMARY', 'PIPELINE_ANALYSIS', 'ACTIVITY_REPORT', 'CONVERSION_FUNNEL', 'CUSTOM']).optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'GENERATED', 'FAILED']).optional(),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0)
})

export async function GET(request: NextRequest) {
  // Rate limit check
  const rateLimitError = await authenticatedRateLimiter(request)
  if (rateLimitError) return rateLimitError

  try {
    // Extract tenant context from headers
    const authData = {
      tenantId: request.headers.get('x-tenant-id') || '',
      userId: request.headers.get('x-user-id') || '',
      userRole: request.headers.get('x-user-role') || 'USER'
    }

    if (!authData.tenantId || !authData.userId) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant context' },
        { status: 401 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const query = reportListSchema.parse({
      search: searchParams.get('search') || undefined,
      type: searchParams.get('type') || undefined,
      status: searchParams.get('status') || undefined,
      dateRange: searchParams.get('dateRange') ? JSON.parse(searchParams.get('dateRange')!) : undefined,
      limit: parseInt(searchParams.get('limit') || '50'),
      offset: parseInt(searchParams.get('offset') || '0')
    })

    // Mock report data with pagination
    const allReports = [
      {
        id: 'report-001',
        name: 'Monthly Contacts Summary',
        type: 'CONTACTS_SUMMARY',
        status: 'GENERATED',
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        generatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        recipients: ['manager@company.com'],
        metrics: ['TOTAL_CONTACTS', 'NEW_CONTACTS', 'CONTACT_BY_STATUS'],
        viewCount: 15,
        downloadCount: 3
      },
      {
        id: 'report-002',
        name: 'Pipeline Analysis - Q1 2024',
        type: 'PIPELINE_ANALYSIS',
        status: 'GENERATED',
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        generatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        recipients: ['sales@company.com', 'vp-sales@company.com'],
        metrics: ['PIPELINE_VALUE', 'DEALS_BY_STAGE', 'CONVERSION_RATE'],
        viewCount: 28,
        downloadCount: 8
      },
      {
        id: 'report-003',
        name: 'Daily Activity Report',
        type: 'ACTIVITY_REPORT',
        status: 'SCHEDULED',
        createdAt: new Date(),
        schedule: { type: 'DAILY', time: '09:00' },
        recipients: ['team@company.com'],
        metrics: ['ACTIVITIES_BY_TYPE', 'ACTIVITY_VOLUME', 'TOP_PERFORMERS'],
        nextScheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      {
        id: 'report-004',
        name: 'Conversion Funnel Analysis',
        type: 'CONVERSION_FUNNEL',
        status: 'GENERATED',
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        generatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        recipients: ['marketing@company.com'],
        metrics: ['LEAD_SOURCES', 'CONVERSION_RATES', 'FUNNEL_DROP_OFF'],
        viewCount: 10,
        downloadCount: 2
      },
      {
        id: 'report-005',
        name: 'Companies Performance Report',
        type: 'COMPANIES_SUMMARY',
        status: 'DRAFT',
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        recipients: [],
        metrics: ['TOTAL_COMPANIES', 'TOP_COMPANIES', 'COMPANY_SEGMENTS']
      }
    ]

    // Apply filtering
    let filtered = allReports
    if (query.search) {
      const search = query.search.toLowerCase()
      filtered = filtered.filter(r => 
        r.name.toLowerCase().includes(search) ||
        r.type.toLowerCase().includes(search)
      )
    }
    if (query.type) {
      filtered = filtered.filter(r => r.type === query.type)
    }
    if (query.status) {
      filtered = filtered.filter(r => r.status === query.status)
    }

    // Apply pagination
    const total = filtered.length
    const paginated = filtered.slice(query.offset, query.offset + query.limit)

    return NextResponse.json(
      {
        success: true,
        data: paginated,
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: uuidv4(),
          pagination: {
            total,
            limit: query.limit,
            offset: query.offset,
            hasMore: query.offset + query.limit < total
          }
        }
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('GET /api/v1/connection/reports error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve reports' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  // Rate limit check
  const rateLimitError = await authenticatedRateLimiter(request)
  if (rateLimitError) return rateLimitError

  try {
    // Extract tenant context
    const authData = {
      tenantId: request.headers.get('x-tenant-id') || '',
      userId: request.headers.get('x-user-id') || '',
      userRole: request.headers.get('x-user-role') || 'USER'
    }

    if (!authData.tenantId || !authData.userId) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant context' },
        { status: 401 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const payload = createReportSchema.parse(body)

    // Generate report ID
    const reportId = uuidv4()
    const createdAt = new Date()

    // Determine initial status
    let status = 'DRAFT'
    let generatedAt: Date | null = null
    let scheduledFor: Date | null = null

    if (payload.schedule) {
      status = 'SCHEDULED'
      if (payload.schedule.type === 'ONE_TIME') {
        scheduledFor = payload.schedule.scheduledFor ? new Date(payload.schedule.scheduledFor) : new Date(Date.now() + 1 * 60 * 60 * 1000)
      } else {
        scheduledFor = new Date() // Next scheduled time would be calculated server-side
      }
    }

    // Create report metadata
    const report = {
      id: reportId,
      name: payload.name,
      description: payload.description || '',
      type: payload.type,
      status,
      templateId: payload.templateId || uuidv4(),
      templateName: payload.templateName || `${payload.type} Template`,
      metrics: payload.metrics || [],
      filters: payload.filters || {},
      schedule: payload.schedule ? {
        type: payload.schedule.type,
        recurrencePattern: payload.schedule.recurrencePattern
      } : null,
      recipients: payload.recipients || [],
      emailFormat: payload.emailFormat || 'HTML',
      includeCharts: payload.includeCharts !== false,
      createdBy: authData.userId,
      createdAt,
      generatedAt: generatedAt as Date | null,
      scheduledFor: scheduledFor as Date | null,
      nextScheduledFor: scheduledFor,
      viewCount: 0,
      downloadCount: 0,
      lastAccessedAt: null,
      deliveryStatus: 'PENDING'
    }

    // Mock: Generate report data if not scheduled
    let reportData: any = null
    if (status === 'DRAFT' || (payload.schedule?.type === 'ONE_TIME' && !payload.schedule.scheduledFor)) {
      reportData = generateReportData(payload.type, payload.metrics || [])
      generatedAt = new Date()
      report.status = 'GENERATED'
      report.generatedAt = generatedAt as Date
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          report,
          generatedData: reportData
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: uuidv4()
        }
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request format', details: error.issues },
        { status: 400 }
      )
    }
    console.error('POST /api/v1/connection/reports error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create report' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  // Rate limit check
  const rateLimitError = await authenticatedRateLimiter(request)
  if (rateLimitError) return rateLimitError

  try {
    // Extract tenant context
    const authData = {
      tenantId: request.headers.get('x-tenant-id') || '',
      userId: request.headers.get('x-user-id') || '',
      userRole: request.headers.get('x-user-role') || 'USER'
    }

    if (!authData.tenantId || !authData.userId) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant context' },
        { status: 401 }
      )
    }

    // Parse batch update payload
    const body = await request.json()
    const updates = z.array(z.object({
      id: z.string().uuid(),
      name: z.string().optional(),
      description: z.string().optional(),
      recipients: z.array(z.string().email()).optional(),
      schedule: z.object({
        type: z.enum(['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY']),
        recurrencePattern: z.string().optional()
      }).optional()
    })).parse(body)

    // Mock update operation
    const results = updates.map(update => ({
      id: update.id,
      success: true,
      message: 'Report updated successfully',
      updatedAt: new Date()
    }))

    return NextResponse.json(
      {
        success: true,
        data: {
          totalUpdated: results.length,
          results
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: uuidv4()
        }
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request format', details: error.issues },
        { status: 400 }
      )
    }
    console.error('PUT /api/v1/connection/reports error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update reports' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  // Rate limit check
  const rateLimitError = await authenticatedRateLimiter(request)
  if (rateLimitError) return rateLimitError

  try {
    // Extract tenant context
    const authData = {
      tenantId: request.headers.get('x-tenant-id') || '',
      userId: request.headers.get('x-user-id') || '',
      userRole: request.headers.get('x-user-role') || 'USER'
    }

    if (!authData.tenantId || !authData.userId) {
      return NextResponse.json(
        { success: false, error: 'Missing tenant context' },
        { status: 401 }
      )
    }

    // Parse batch delete payload
    const body = await request.json()
    const ids = z.array(z.string().uuid()).parse(body)

    // Mock delete operation
    const results = ids.map(id => ({
      id,
      success: true,
      message: 'Report deleted successfully',
      deletedAt: new Date()
    }))

    return NextResponse.json(
      {
        success: true,
        data: {
          totalDeleted: results.length,
          results
        },
        metadata: {
          timestamp: new Date().toISOString(),
          requestId: uuidv4()
        }
      },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request format', details: error.issues },
        { status: 400 }
      )
    }
    console.error('DELETE /api/v1/connection/reports error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete reports' },
      { status: 500 }
    )
  }
}

/**
 * Generate mock report data based on report type
 */
function generateReportData(type: string, metrics: string[]) {
  const baseData = {
    generatedAt: new Date(),
    period: { from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to: new Date() },
    tenantName: 'Acme Corporation'
  }

  switch (type) {
    case 'CONTACTS_SUMMARY':
      return {
        ...baseData,
        totalContacts: 487,
        newContacts: 42,
        contactsByStatus: { NEW: 120, ACTIVE: 245, INACTIVE: 87, ARCHIVED: 35 },
        topContactSources: [
          { source: 'Direct', count: 145 },
          { source: 'Referral', count: 98 },
          { source: 'Website', count: 87 }
        ]
      }

    case 'COMPANIES_SUMMARY':
      return {
        ...baseData,
        totalCompanies: 128,
        newCompanies: 8,
        companiesByIndustry: {
          'Technology': 45,
          'Finance': 28,
          'Healthcare': 22,
          'Retail': 18,
          'Other': 15
        },
        topCompanies: [
          { name: 'TechCorp Inc', contactCount: 28, leadCount: 12, pipelineValue: 450000 },
          { name: 'Global Industries', contactCount: 22, leadCount: 8, pipelineValue: 380000 }
        ]
      }

    case 'LEADS_SUMMARY':
      return {
        ...baseData,
        totalLeads: 892,
        newLeads: 145,
        leadsByStage: { PROSPECT: 250, QUALIFIED: 180, PROPOSAL: 95, NEGOTIATION: 45, WON: 322 },
        conversionRate: 36.1,
        averageTimeInStage: 18.5
      }

    case 'PIPELINE_ANALYSIS':
      return {
        ...baseData,
        pipelineValue: 2850000,
        dealsByStage: [
          { stage: 'PROSPECT', count: 250, value: 1250000 },
          { stage: 'QUALIFIED', count: 180, value: 900000 },
          { stage: 'PROPOSAL', count: 95, value: 475000 },
          { stage: 'NEGOTIATION', count: 45, value: 225000 }
        ],
        conversionFunnel: {
          toProspect: 100,
          toQualified: 72,
          toProposal: 53,
          toNegotiation: 47.3,
          toWon: 36.1
        }
      }

    case 'ACTIVITY_REPORT':
      return {
        ...baseData,
        totalActivities: 1248,
        activitiesByType: {
          'EMAIL': 487,
          'CALL': 321,
          'MEETING': 189,
          'NOTE': 251
        },
        topPerformers: [
          { name: 'John Smith', activities: 89 },
          { name: 'Jane Doe', activities: 76 },
          { name: 'Bob Johnson', activities: 64 }
        ]
      }

    case 'CONVERSION_FUNNEL':
      return {
        ...baseData,
        funnel: [
          { stage: 'Awareness', count: 5000 },
          { stage: 'Interest', count: 1200 },
          { stage: 'Consideration', count: 450 },
          { stage: 'Decision', count: 95 },
          { stage: 'Purchase', count: 34 }
        ],
        dropOffRates: [
          { fromStage: 'Awareness', toStage: 'Interest', rate: 76 },
          { fromStage: 'Interest', toStage: 'Consideration', rate: 62.5 },
          { fromStage: 'Consideration', toStage: 'Decision', rate: 78.8 }
        ]
      }

    default:
      return {
        ...baseData,
        customData: {
          metric1: 100,
          metric2: 250,
          metric3: 75.5
        }
      }
  }
}
