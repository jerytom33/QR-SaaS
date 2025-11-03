import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context'
import { authenticatedRateLimiter } from '@/lib/middleware/rate-limit'

/**
 * Analytics API - Phase 2.1l
 * Read-only aggregation, metrics, trends, dashboards, and time-series analytics
 * Provides insights into CRM data patterns and performance
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

const analyticsQuerySchema = z.object({
  metric: z.enum([
    'CONTACTS_TOTAL',
    'COMPANIES_TOTAL',
    'LEADS_TOTAL',
    'CONVERSION_RATE',
    'PIPELINE_VALUE',
    'ACTIVITY_VOLUME',
    'CONTACTS_BY_STATUS',
    'LEADS_BY_STAGE',
    'TOP_COMPANIES',
    'RECENT_ACTIVITIES'
  ]),
  period: z.enum(['TODAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'ALL']).optional().default('MONTH'),
  granularity: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).optional().default('DAILY'),
  groupBy: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100)
})

// ========================================================================
// GET /api/v1/connection/analytics
// Retrieve analytics and metrics
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
    const metric = searchParams.get('metric') || 'CONTACTS_TOTAL'
    const period = searchParams.get('period') || 'MONTH'
    const granularity = searchParams.get('granularity') || 'DAILY'

    const queryParams = analyticsQuerySchema.parse({
      metric,
      period,
      granularity
    })

    // Get tenant context
    const tenantContext = getTenantContextFromUser({
      tenantId: authUser.tenantId,
      role: authUser.role
    })

    // Calculate period dates
    const now = new Date()
    let startDate = new Date()

    switch (queryParams.period) {
      case 'TODAY':
        startDate.setHours(0, 0, 0, 0)
        break
      case 'WEEK':
        startDate.setDate(now.getDate() - 7)
        break
      case 'MONTH':
        startDate.setMonth(now.getMonth() - 1)
        break
      case 'QUARTER':
        startDate.setMonth(now.getMonth() - 3)
        break
      case 'YEAR':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      case 'ALL':
        startDate = new Date('2000-01-01')
        break
    }

    // Fetch analytics data
    const result = await withTenantContext(db, tenantContext, async (tx) => {
      // Mock data based on metric
      switch (queryParams.metric) {
        case 'CONTACTS_TOTAL':
          return {
            metric: 'CONTACTS_TOTAL',
            period: queryParams.period,
            value: 487,
            change: 12.5,
            trend: 'UP',
            timeSeries: generateTimeSeries(queryParams.granularity, startDate, now, [45, 52, 58, 63, 72, 81, 92, 105, 115, 128])
          }

        case 'COMPANIES_TOTAL':
          return {
            metric: 'COMPANIES_TOTAL',
            period: queryParams.period,
            value: 128,
            change: 8.3,
            trend: 'UP',
            timeSeries: generateTimeSeries(queryParams.granularity, startDate, now, [10, 12, 14, 18, 22, 28, 35, 45, 58, 72, 85, 101, 118, 128])
          }

        case 'LEADS_TOTAL':
          return {
            metric: 'LEADS_TOTAL',
            period: queryParams.period,
            value: 892,
            change: -5.2,
            trend: 'DOWN',
            timeSeries: generateTimeSeries(queryParams.granularity, startDate, now, [150, 160, 155, 148, 140, 135, 138, 142, 145, 150])
          }

        case 'CONVERSION_RATE':
          return {
            metric: 'CONVERSION_RATE',
            period: queryParams.period,
            value: 18.7,
            unit: '%',
            change: 2.4,
            trend: 'UP',
            timeSeries: generateTimeSeries(queryParams.granularity, startDate, now, [12.5, 13.2, 14.1, 15.3, 16.8, 17.2, 17.9, 18.5, 18.7])
          }

        case 'PIPELINE_VALUE':
          return {
            metric: 'PIPELINE_VALUE',
            period: queryParams.period,
            value: 2850000,
            unit: 'USD',
            change: 18.5,
            trend: 'UP',
            timeSeries: generateTimeSeries(queryParams.granularity, startDate, now, [1250000, 1450000, 1650000, 1890000, 2150000, 2380000, 2650000, 2850000])
          }

        case 'ACTIVITY_VOLUME':
          return {
            metric: 'ACTIVITY_VOLUME',
            period: queryParams.period,
            value: 1248,
            change: 35.2,
            trend: 'UP',
            breakdown: {
              'EMAIL': 487,
              'CALL': 321,
              'MEETING': 189,
              'NOTE': 251
            },
            timeSeries: generateTimeSeries(queryParams.granularity, startDate, now, [80, 95, 105, 120, 135, 150, 165, 180, 195, 208, 220])
          }

        case 'CONTACTS_BY_STATUS':
          return {
            metric: 'CONTACTS_BY_STATUS',
            period: queryParams.period,
            breakdown: {
              'NEW': 120,
              'ACTIVE': 245,
              'INACTIVE': 87,
              'ARCHIVED': 35
            },
            total: 487
          }

        case 'LEADS_BY_STAGE':
          return {
            metric: 'LEADS_BY_STAGE',
            period: queryParams.period,
            breakdown: {
              'PROSPECT': 250,
              'QUALIFIED': 180,
              'PROPOSAL': 95,
              'NEGOTIATION': 45,
              'WON': 322
            },
            total: 892,
            conversionRate: 36.1
          }

        case 'TOP_COMPANIES':
          return {
            metric: 'TOP_COMPANIES',
            period: queryParams.period,
            limit: 5,
            data: [
              { id: 'c-1', name: 'TechCorp', contactCount: 28, leadCount: 145, pipelineValue: 450000 },
              { id: 'c-2', name: 'Global Industries', contactCount: 22, leadCount: 92, pipelineValue: 380000 },
              { id: 'c-3', name: 'Enterprise Solutions', contactCount: 18, leadCount: 78, pipelineValue: 320000 },
              { id: 'c-4', name: 'Digital Ventures', contactCount: 15, leadCount: 65, pipelineValue: 280000 },
              { id: 'c-5', name: 'Innovation Group', contactCount: 12, leadCount: 58, pipelineValue: 240000 }
            ]
          }

        case 'RECENT_ACTIVITIES':
          return {
            metric: 'RECENT_ACTIVITIES',
            period: queryParams.period,
            limit: 10,
            data: [
              { id: 'a-1', type: 'EMAIL', entityType: 'CONTACT', description: 'Email sent to John Doe', timestamp: new Date(Date.now() - 600000) },
              { id: 'a-2', type: 'CALL', entityType: 'LEAD', description: 'Call with Jane Smith', timestamp: new Date(Date.now() - 1200000) },
              { id: 'a-3', type: 'MEETING', entityType: 'COMPANY', description: 'Meeting with TechCorp', timestamp: new Date(Date.now() - 1800000) },
              { id: 'a-4', type: 'NOTE', entityType: 'CONTACT', description: 'Follow-up note added', timestamp: new Date(Date.now() - 2400000) },
              { id: 'a-5', type: 'EMAIL', entityType: 'LEAD', description: 'Proposal sent', timestamp: new Date(Date.now() - 3000000) }
            ]
          }

        default:
          return {
            metric: queryParams.metric,
            period: queryParams.period,
            value: 0,
            error: 'Unknown metric'
          }
      }
    })

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date(),
        requestId: request.headers.get('x-request-id') || crypto.randomUUID()
      }
    })
  } catch (error) {
    console.error('GET /analytics error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ========================================================================
// Helper Functions
// ========================================================================

function generateTimeSeries(
  granularity: string,
  startDate: Date,
  endDate: Date,
  values: number[]
): Array<{ timestamp: Date; value: number }> {
  const timeSeries: Array<{ timestamp: Date; value: number }> = []
  const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  for (let i = 0; i < Math.min(values.length, daysInRange); i++) {
    const timestamp = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000)
    timeSeries.push({
      timestamp,
      value: values[i] || 0
    })
  }

  return timeSeries
}
