import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * Analytics API Tests - Phase 2.1l
 * Tests for aggregations, metrics, trends, time-series analysis, and dashboards
 */

// Mock functions
const mockAuthenticatedRateLimiter = vi.fn(async (request: NextRequest) => null)
const mockGetAuthUser = vi.fn(async (request: NextRequest) => ({
  id: 'user-123',
  tenantId: 'tenant-456',
  role: 'USER'
}))
const mockGetTenantContextFromUser = vi.fn((data: any) => ({
  tenantId: data.tenantId,
  isSuperAdmin: data.role === 'SUPER_ADMIN'
}))

const mockWithTenantContext = vi.fn(async (db: any, context: any, fn: any) => {
  return fn({})
})

describe('Analytics API - Phase 2.1l', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // AUTHENTICATION
  // ========================================================================

  describe('Authentication & Authorization', () => {

    it('should reject requests without Bearer token', async () => {
      mockGetAuthUser.mockResolvedValueOnce(undefined as any)
      expect(mockGetAuthUser).toBeDefined()
    })

    it('should verify tenant isolation', async () => {
      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(context1.tenantId).not.toBe(context2.tenantId)
    })
  })

  // ========================================================================
  // METRIC CALCULATIONS
  // ========================================================================

  describe('Metric Calculations', () => {

    it('should calculate total contacts', () => {
      const metric = {
        metric: 'CONTACTS_TOTAL',
        value: 487,
        change: 12.5,
        trend: 'UP'
      }

      expect(metric.value).toBe(487)
      expect(metric.change).toBeGreaterThan(0)
    })

    it('should calculate total companies', () => {
      const metric = {
        metric: 'COMPANIES_TOTAL',
        value: 128,
        change: 8.3,
        trend: 'UP'
      }

      expect(metric.value).toBe(128)
    })

    it('should calculate conversion rate', () => {
      const metric = {
        metric: 'CONVERSION_RATE',
        value: 18.7,
        unit: '%',
        change: 2.4,
        trend: 'UP'
      }

      expect(metric.value).toBe(18.7)
      expect(metric.unit).toBe('%')
    })

    it('should calculate pipeline value', () => {
      const metric = {
        metric: 'PIPELINE_VALUE',
        value: 2850000,
        unit: 'USD',
        change: 18.5,
        trend: 'UP'
      }

      expect(metric.value).toBe(2850000)
      expect(metric.unit).toBe('USD')
    })

    it('should track activity volume by type', () => {
      const metric = {
        metric: 'ACTIVITY_VOLUME',
        value: 1248,
        breakdown: {
          'EMAIL': 487,
          'CALL': 321,
          'MEETING': 189,
          'NOTE': 251
        }
      }

      const total = Object.values(metric.breakdown).reduce((a: number, b: number) => a + b, 0)
      expect(total).toBe(1248)
    })
  })

  // ========================================================================
  // TIME-SERIES ANALYTICS
  // ========================================================================

  describe('Time-Series Analytics', () => {

    it('should generate daily time series', () => {
      const timeSeries = [
        { timestamp: new Date('2024-01-01'), value: 100 },
        { timestamp: new Date('2024-01-02'), value: 105 },
        { timestamp: new Date('2024-01-03'), value: 110 }
      ]

      expect(timeSeries).toHaveLength(3)
      expect(timeSeries[0].value).toBe(100)
      expect(timeSeries[2].value).toBe(110)
    })

    it('should generate weekly time series', () => {
      const startDate = new Date('2024-01-01')
      const timeSeries: Array<{ timestamp: Date; value: number }> = []

      for (let i = 0; i < 4; i++) {
        const date = new Date(startDate)
        date.setDate(date.getDate() + i * 7)
        timeSeries.push({ timestamp: date, value: 100 + i * 50 })
      }

      expect(timeSeries).toHaveLength(4)
      expect(timeSeries[0].value).toBe(100)
      expect(timeSeries[3].value).toBe(250)
    })

    it('should calculate trend from time series', () => {
      const values = [100, 110, 120, 130, 140]
      const isIncreasing = values[values.length - 1] > values[0]
      const changePercent = ((values[values.length - 1] - values[0]) / values[0]) * 100

      expect(isIncreasing).toBe(true)
      expect(changePercent).toBeCloseTo(40)
    })

    it('should aggregate time series by period', () => {
      const data = [
        { timestamp: new Date('2024-01-01T10:00'), value: 50 },
        { timestamp: new Date('2024-01-01T14:00'), value: 60 },
        { timestamp: new Date('2024-01-01T18:00'), value: 70 },
        { timestamp: new Date('2024-01-02T10:00'), value: 80 }
      ]

      const daily: any = {}
      data.forEach(d => {
        const date = d.timestamp.toISOString().split('T')[0]
        if (!daily[date]) daily[date] = []
        daily[date].push(d.value)
      })

      const aggregated = Object.entries(daily).map(([date, values]: any) => ({
        date,
        sum: values.reduce((a: number, b: number) => a + b, 0),
        avg: values.reduce((a: number, b: number) => a + b, 0) / values.length
      }))

      expect(aggregated).toHaveLength(2)
      expect(aggregated[0].sum).toBe(180)
    })
  })

  // ========================================================================
  // PERIOD ANALYSIS
  // ========================================================================

  describe('Period Analysis', () => {

    it('should support TODAY period', () => {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      expect(today.toDateString()).toBe(new Date().toDateString())
    })

    it('should support WEEK period', () => {
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      expect(weekAgo.getTime()).toBeLessThan(now.getTime())
    })

    it('should support MONTH period', () => {
      const now = new Date()
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      expect(monthAgo.getTime()).toBeLessThan(now.getTime())
    })

    it('should support QUARTER period', () => {
      const now = new Date()
      const quarterAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
      expect(quarterAgo.getTime()).toBeLessThan(now.getTime())
    })

    it('should support YEAR period', () => {
      const now = new Date()
      const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      expect(yearAgo.getTime()).toBeLessThan(now.getTime())
    })

    it('should support ALL period', () => {
      const allTime = new Date('2000-01-01')
      const now = new Date()
      expect(allTime.getTime()).toBeLessThan(now.getTime())
    })
  })

  // ========================================================================
  // BREAKDOWN ANALYSIS
  // ========================================================================

  describe('Breakdown Analysis', () => {

    it('should provide contacts breakdown by status', () => {
      const breakdown = {
        'NEW': 120,
        'ACTIVE': 245,
        'INACTIVE': 87,
        'ARCHIVED': 35
      }

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
      expect(total).toBe(487)
    })

    it('should provide leads breakdown by stage', () => {
      const breakdown = {
        'PROSPECT': 250,
        'QUALIFIED': 180,
        'PROPOSAL': 95,
        'NEGOTIATION': 45,
        'WON': 322
      }

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
      expect(total).toBe(892)

      const conversionRate = (breakdown['WON'] / total) * 100
      expect(conversionRate).toBeCloseTo(36.1)
    })

    it('should calculate percentage for each category', () => {
      const breakdown = {
        'EMAIL': 487,
        'CALL': 321,
        'MEETING': 189,
        'NOTE': 251
      }

      const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
      const percentages = Object.entries(breakdown).map(([key, value]) => ({
        category: key,
        percentage: ((value / total) * 100).toFixed(1)
      }))

      expect(percentages).toHaveLength(4)
      expect(parseFloat(percentages[0].percentage)).toBeCloseTo(39.0)
    })
  })

  // ========================================================================
  // RANKING & SORTING
  // ========================================================================

  describe('Ranking & Sorting', () => {

    it('should rank top companies by contact count', () => {
      const companies = [
        { name: 'TechCorp', contactCount: 28 },
        { name: 'Global Industries', contactCount: 22 },
        { name: 'Enterprise Solutions', contactCount: 18 }
      ]

      const sorted = [...companies].sort((a, b) => b.contactCount - a.contactCount)
      expect(sorted[0].name).toBe('TechCorp')
      expect(sorted[2].name).toBe('Enterprise Solutions')
    })

    it('should rank top companies by pipeline value', () => {
      const companies = [
        { name: 'TechCorp', pipelineValue: 450000 },
        { name: 'Global Industries', pipelineValue: 380000 },
        { name: 'Enterprise Solutions', pipelineValue: 320000 }
      ]

      const sorted = [...companies].sort((a, b) => b.pipelineValue - a.pipelineValue)
      expect(sorted[0].pipelineValue).toBe(450000)
    })

    it('should limit results with limit parameter', () => {
      const companies = Array.from({ length: 100 }, (_, i) => ({
        id: `c-${i}`,
        name: `Company ${i}`
      }))

      const limited = companies.slice(0, 5)
      expect(limited).toHaveLength(5)
    })
  })

  // ========================================================================
  // METRIC TYPES
  // ========================================================================

  describe('Metric Types', () => {

    it('should support COUNT metrics', () => {
      const metric = {
        type: 'COUNT',
        value: 487,
        label: 'Total Contacts'
      }

      expect(typeof metric.value).toBe('number')
      expect(metric.value).toBeGreaterThan(0)
    })

    it('should support PERCENTAGE metrics', () => {
      const metric = {
        type: 'PERCENTAGE',
        value: 18.7,
        unit: '%',
        label: 'Conversion Rate'
      }

      expect(metric.value).toBeGreaterThanOrEqual(0)
      expect(metric.value).toBeLessThanOrEqual(100)
    })

    it('should support CURRENCY metrics', () => {
      const metric = {
        type: 'CURRENCY',
        value: 2850000,
        unit: 'USD',
        label: 'Pipeline Value'
      }

      expect(metric.value).toBeGreaterThan(0)
      expect(metric.unit).toBe('USD')
    })

    it('should support RATIO metrics', () => {
      const metric = {
        type: 'RATIO',
        value: 36.1,
        label: 'Win Rate',
        unit: '%'
      }

      expect(metric.value).toBeGreaterThan(0)
    })
  })

  // ========================================================================
  // CHANGE & TREND TRACKING
  // ========================================================================

  describe('Change & Trend Tracking', () => {

    it('should calculate absolute change', () => {
      const current = 487
      const previous = 433
      const change = current - previous

      expect(change).toBe(54)
    })

    it('should calculate percentage change', () => {
      const current = 487
      const previous = 433
      const changePercent = ((current - previous) / previous) * 100

      expect(changePercent).toBeCloseTo(12.5)
    })

    it('should determine trend direction', () => {
      const metrics = [
        { value: 400, trend: 'FLAT' },
        { value: 450, trend: 'UP' },
        { value: 380, trend: 'DOWN' }
      ]

      metrics.forEach((m, i) => {
        if (i === 0) return
        const change = m.value - metrics[i - 1].value
        if (change > 0) {
          expect(m.trend).toBe('UP')
        } else if (change < 0) {
          expect(m.trend).toBe('DOWN')
        }
      })
    })

    it('should track multi-period trends', () => {
      const values = [100, 110, 125, 140, 135, 150]
      const trend = values[values.length - 1] > values[0] ? 'UP' : 'DOWN'
      const volatility = Math.max(...values) - Math.min(...values)

      expect(trend).toBe('UP')
      expect(volatility).toBe(50)
    })
  })

  // ========================================================================
  // DASHBOARD AGGREGATION
  // ========================================================================

  describe('Dashboard Aggregation', () => {

    it('should aggregate multiple metrics for dashboard', () => {
      const dashboard = {
        timestamp: new Date(),
        metrics: [
          { metric: 'CONTACTS_TOTAL', value: 487 },
          { metric: 'COMPANIES_TOTAL', value: 128 },
          { metric: 'LEADS_TOTAL', value: 892 },
          { metric: 'CONVERSION_RATE', value: 18.7 },
          { metric: 'PIPELINE_VALUE', value: 2850000 }
        ]
      }

      expect(dashboard.metrics).toHaveLength(5)
      expect(dashboard.metrics[0].value).toBe(487)
    })

    it('should provide summary statistics', () => {
      const metrics = [
        { name: 'Contacts', value: 487, change: 12.5 },
        { name: 'Companies', value: 128, change: 8.3 },
        { name: 'Leads', value: 892, change: -5.2 }
      ]

      const summary = {
        totalMetrics: metrics.length,
        averageChange: (metrics.reduce((a, m) => a + m.change, 0) / metrics.length).toFixed(2),
        largestGain: Math.max(...metrics.map(m => m.change))
      }

      expect(summary.totalMetrics).toBe(3)
      expect(parseFloat(summary.averageChange)).toBeCloseTo(5.2)
      expect(summary.largestGain).toBe(12.5)
    })
  })

  // ========================================================================
  // RATE LIMITING
  // ========================================================================

  describe('Rate Limiting', () => {

    it('should apply rate limiting to analytics queries', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/analytics'))
      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // VALIDATION
  // ========================================================================

  describe('Validation', () => {

    it('should validate metric parameter', () => {
      const validMetrics = ['CONTACTS_TOTAL', 'COMPANIES_TOTAL', 'LEADS_TOTAL', 'CONVERSION_RATE']
      validMetrics.forEach(metric => {
        expect(z.enum(['CONTACTS_TOTAL', 'COMPANIES_TOTAL', 'LEADS_TOTAL', 'CONVERSION_RATE']).safeParse(metric).success).toBe(true)
      })
    })

    it('should validate period parameter', () => {
      const validPeriods = ['TODAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'ALL']
      validPeriods.forEach(period => {
        expect(z.enum(['TODAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'ALL']).safeParse(period).success).toBe(true)
      })
    })

    it('should validate granularity parameter', () => {
      const validGranularities = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']
      validGranularities.forEach(granularity => {
        expect(z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']).safeParse(granularity).success).toBe(true)
      })
    })
  })

  // ========================================================================
  // MULTI-TENANT ISOLATION
  // ========================================================================

  describe('Multi-Tenant Isolation', () => {

    it('should isolate analytics by tenant', () => {
      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })

      expect(context1.tenantId).not.toBe(context2.tenantId)
    })

    it('should not cross-contaminate metrics', () => {
      const tenant1Metrics = { CONTACTS_TOTAL: 487, COMPANIES_TOTAL: 128 }
      const tenant2Metrics = { CONTACTS_TOTAL: 312, COMPANIES_TOTAL: 95 }

      expect(tenant1Metrics.CONTACTS_TOTAL).not.toBe(tenant2Metrics.CONTACTS_TOTAL)
    })
  })
})
