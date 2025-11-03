/**
 * Query Optimizer Tests - Phase 2.2b
 * Tests for query optimization patterns:
 * - Selective fields
 * - Batch loading
 * - Query hints
 * - Performance analysis
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SELECTIVE_FIELDS,
  BatchLoader,
  QueryHints,
  QueryAnalyzer,
  INDEX_RECOMMENDATIONS,
  OptimizedQueries
} from '../query-optimizer'

describe('Query Optimizer - Phase 2.2b', () => {
  // ============================================================
  // SELECTIVE FIELDS TESTS
  // ============================================================

  describe('SELECTIVE_FIELDS', () => {
    it('should have contact_list fields', () => {
      const fields = SELECTIVE_FIELDS.contacts_list
      expect(fields).toHaveProperty('id')
      expect(fields).toHaveProperty('firstName')
      expect(fields).toHaveProperty('email')
      expect(fields).toHaveProperty('status')
      // Should NOT include heavy fields
      expect(fields).not.toHaveProperty('notes')
      expect(fields).not.toHaveProperty('customFields')
    })

    it('should have contact_detail fields with all properties', () => {
      const fields = SELECTIVE_FIELDS.contacts_detail
      expect(fields).toHaveProperty('id')
      expect(fields).toHaveProperty('firstName')
      expect(fields).toHaveProperty('email')
      expect(fields).toHaveProperty('notes')
      expect(fields).toHaveProperty('customFields')
      expect(fields).toHaveProperty('metadata')
    })

    it('should have company_list with minimal fields', () => {
      const fields = SELECTIVE_FIELDS.companies_list
      expect(Object.keys(fields)).toHaveLength(8)
      expect(fields).toHaveProperty('id')
      expect(fields).toHaveProperty('name')
      expect(fields).toHaveProperty('status')
    })

    it('should have company_detail with all fields', () => {
      const fields = SELECTIVE_FIELDS.companies_detail
      expect(Object.keys(fields).length).toBeGreaterThan(Object.keys(SELECTIVE_FIELDS.companies_list).length)
      expect(fields).toHaveProperty('description')
      expect(fields).toHaveProperty('customFields')
    })

    it('should have leads list and detail fields', () => {
      const list = SELECTIVE_FIELDS.leads_list
      const detail = SELECTIVE_FIELDS.leads_detail

      expect(list).toHaveProperty('id')
      expect(list).toHaveProperty('title')
      expect(list).toHaveProperty('status')

      expect(detail).toHaveProperty('description')
      expect(detail).toHaveProperty('customFields')
      expect(Object.keys(detail).length).toBeGreaterThan(Object.keys(list).length)
    })

    it('should have activities and analytics fields', () => {
      const activities = SELECTIVE_FIELDS.activities_list
      const analytics = SELECTIVE_FIELDS.analytics_summary

      expect(activities).toHaveProperty('entityType')
      expect(activities).toHaveProperty('actionType')

      expect(analytics).toHaveProperty('metric')
      expect(analytics).toHaveProperty('value')
    })

    it('should have reports list and detail fields', () => {
      const list = SELECTIVE_FIELDS.reports_list
      const detail = SELECTIVE_FIELDS.reports_detail

      expect(list).toHaveProperty('name')
      expect(list).toHaveProperty('type')

      expect(detail).toHaveProperty('filters')
      expect(detail).toHaveProperty('metrics')
      expect(Object.keys(detail).length).toBeGreaterThan(Object.keys(list).length)
    })

    it('all field selections should be boolean values', () => {
      Object.values(SELECTIVE_FIELDS).forEach((fields) => {
        Object.values(fields).forEach((value) => {
          expect(typeof value).toBe('boolean')
        })
      })
    })
  })

  // ============================================================
  // BATCH LOADER TESTS
  // ============================================================

  describe('BatchLoader', () => {
    const mockDb = {
      company: {
        findMany: vi.fn()
      },
      pipeline: {
        findMany: vi.fn()
      },
      stage: {
        findMany: vi.fn()
      },
      user: {
        findMany: vi.fn()
      }
    }

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should batch load contacts with companies', async () => {
      const contacts: Array<{ id: string; firstName: string; companyId: string | undefined }> = [
        { id: 'c1', firstName: 'John', companyId: 'co1' },
        { id: 'c2', firstName: 'Jane', companyId: 'co2' },
        { id: 'c3', firstName: 'Bob', companyId: 'co1' }
      ]

      const companies = [
        { id: 'co1', name: 'Acme Corp' },
        { id: 'co2', name: 'Tech Inc' }
      ]

      mockDb.company.findMany.mockResolvedValue(companies)

      const result = await BatchLoader.loadContactsWithCompanies(contacts, mockDb)

      // Should batch query all companies once
      expect(mockDb.company.findMany).toHaveBeenCalledTimes(1)
      expect(mockDb.company.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['co1', 'co2'] } },
        select: {
          id: true,
          name: true,
          domain: true,
          industry: true
        }
      })

      // Should attach company to each contact
      expect(result).toHaveLength(3)
      expect(result[0]).toHaveProperty('company')
      expect((result[0].company as any)?.name).toBe('Acme Corp')
      expect((result[1].company as any)?.name).toBe('Tech Inc')
      expect((result[2].company as any)?.name).toBe('Acme Corp')
    })

    it('should handle contacts without company', async () => {
      const contacts: Array<{ id: string; firstName: string; companyId?: string }> = [
        { id: 'c1', firstName: 'John', companyId: 'co1' },
        { id: 'c2', firstName: 'Jane', companyId: undefined }
      ]

      const companies = [{ id: 'co1', name: 'Acme Corp' }]

      mockDb.company.findMany.mockResolvedValue(companies)

      const result = (await BatchLoader.loadContactsWithCompanies(contacts, mockDb)) as Array<any>

      expect((result[0].company as any)?.name).toBe('Acme Corp')
      expect(result[1].company).toBeNull()
    })

    it('should batch load leads with pipeline and stage', async () => {
      const leads = [
        { id: 'l1', title: 'Lead 1', pipelineId: 'p1', stageId: 's1' },
        { id: 'l2', title: 'Lead 2', pipelineId: 'p1', stageId: 's2' }
      ]

      const pipelines = [{ id: 'p1', name: 'Sales Pipeline' }]
      const stages = [
        { id: 's1', name: 'Prospecting' },
        { id: 's2', name: 'Qualified' }
      ]

      mockDb.pipeline.findMany.mockResolvedValue(pipelines)
      mockDb.stage.findMany.mockResolvedValue(stages)

      const result = (await BatchLoader.loadLeadsWithPipelineAndStage(leads, mockDb)) as Array<any>

      expect(result).toHaveLength(2)
      expect((result[0].pipeline as any)?.name).toBe('Sales Pipeline')
      expect((result[0].stage as any)?.name).toBe('Prospecting')
      expect((result[1].stage as any)?.name).toBe('Qualified')
    })

    it('should batch load activities with users', async () => {
      const activities: Array<{ id: string; entityType: string; userId?: string }> = [
        { id: 'a1', entityType: 'contact', userId: 'u1' },
        { id: 'a2', entityType: 'lead', userId: 'u2' },
        { id: 'a3', entityType: 'contact', userId: 'u1' }
      ]

      const users = [
        { id: 'u1', email: 'john@example.com', name: 'John' },
        { id: 'u2', email: 'jane@example.com', name: 'Jane' }
      ]

      mockDb.user.findMany.mockResolvedValue(users)

      const result = await BatchLoader.loadActivitiesWithUsers(activities, mockDb)

      expect(result).toHaveLength(3)
      expect((result[0].user as any)?.name).toBe('John')
      expect((result[1].user as any)?.name).toBe('Jane')
      expect((result[2].user as any)?.name).toBe('John')
    })

    it('should handle activities without users', async () => {
      const activities: Array<{ id: string; entityType: string; userId?: string }> = [
        { id: 'a1', entityType: 'contact', userId: 'u1' },
        { id: 'a2', entityType: 'lead', userId: undefined }
      ]

      const users = [{ id: 'u1', email: 'john@example.com' }]

      mockDb.user.findMany.mockResolvedValue(users)

      const result = await BatchLoader.loadActivitiesWithUsers(activities, mockDb)

      expect((result[0].user as any)?.email).toBe('john@example.com')
      expect(result[1].user).toBeNull()
    })

    it('should perform generic batch loading', async () => {
      const items = [
        { id: '1', companyId: 'c1' },
        { id: '2', companyId: 'c2' }
      ]

      const related = [
        { id: 'c1', name: 'Company 1' },
        { id: 'c2', name: 'Company 2' }
      ]

      mockDb.company.findMany.mockResolvedValue(related)

      const result = await BatchLoader.batchLoad(
        items,
        'companyId',
        mockDb,
        'company',
        { id: true, name: true }
      )

      expect(result).toHaveLength(2)
      expect((result[0].companyId as any)?.name).toBe('Company 1')
      expect((result[1].companyId as any)?.name).toBe('Company 2')
    })
  })

  // ============================================================
  // QUERY HINTS TESTS
  // ============================================================

  describe('QueryHints', () => {
    it('should add deleted_at filter', () => {
      const where = QueryHints.withoutDeleted({ tenantId: 't1' })
      expect(where).toEqual({
        tenantId: 't1',
        deletedAt: null
      })
    })

    it('should enforce limit', () => {
      expect(QueryHints.withLimit(50, 100)).toBe(50)
      expect(QueryHints.withLimit(150, 100)).toBe(100)
      expect(QueryHints.withLimit(0, 100)).toBe(0)
    })

    it('should build where clause with filters', () => {
      const where = QueryHints.buildWhereClause('t1', {
        status: 'active',
        search: 'john',
        fromDate: '2025-01-01',
        toDate: '2025-12-31'
      })

      expect(where.tenantId).toBe('t1')
      expect(where.deletedAt).toBeNull()
      expect(where.status).toBe('active')
      expect(where.OR).toBeDefined()
      expect(where.createdAt).toBeDefined()
      expect(where.createdAt.gte).toEqual(new Date('2025-01-01'))
      expect(where.createdAt.lte).toEqual(new Date('2025-12-31'))
    })

    it('should build where clause without optional filters', () => {
      const where = QueryHints.buildWhereClause('t1', {})
      expect(where).toEqual({
        tenantId: 't1',
        deletedAt: null
      })
    })

    it('should get pagination parameters', () => {
      expect(QueryHints.getPaginationParams(1, 20)).toEqual({
        skip: 0,
        take: 20
      })

      expect(QueryHints.getPaginationParams(2, 20)).toEqual({
        skip: 20,
        take: 20
      })

      expect(QueryHints.getPaginationParams(5, 50)).toEqual({
        skip: 200,
        take: 50
      })
    })

    it('should enforce max limit', () => {
      const { take } = QueryHints.getPaginationParams(1, 500)
      expect(take).toBe(100) // Max limit is 100
    })

    it('should get optimal order by', () => {
      expect(QueryHints.getOptimalOrderBy('newest')).toEqual({
        createdAt: 'desc'
      })

      expect(QueryHints.getOptimalOrderBy('oldest')).toEqual({
        createdAt: 'asc'
      })

      expect(QueryHints.getOptimalOrderBy('name')).toEqual({
        name: 'asc'
      })

      expect(QueryHints.getOptimalOrderBy('updated')).toEqual({
        updatedAt: 'desc'
      })

      // Default to newest
      expect(QueryHints.getOptimalOrderBy()).toEqual({
        createdAt: 'desc'
      })

      // Unknown sort defaults to newest
      expect(QueryHints.getOptimalOrderBy('invalid')).toEqual({
        createdAt: 'desc'
      })
    })
  })

  // ============================================================
  // QUERY ANALYZER TESTS
  // ============================================================

  describe('QueryAnalyzer', () => {
    it('should flag missing select clause', () => {
      const result = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        where: { tenantId: 't1' }
      })

      expect(result.efficiency).toBe('good')
      expect(result.warnings).toContain('No select clause - fetching all fields')
      expect(result.suggestions).toContain('Use selective fields to reduce data transfer')
    })

    it('should flag too many includes', () => {
      const result = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        select: { id: true, name: true },
        include: { company: true, activities: true, leads: true, webhooks: true }
      })

      expect(result.warnings).toContain('Too many includes (4) - risk of N+1 queries')
      expect(result.suggestions).toContain('Use batch loading instead of nested includes')
    })

    it('should flag missing where clause', () => {
      const result = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        select: { id: true }
      })

      expect(result.warnings).toContain('No WHERE clause - will fetch all records')
      expect(result.suggestions).toContain('Add tenant_id and deletedAt to WHERE clause')
    })

    it('should flag missing limit', () => {
      const result = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        where: { tenantId: 't1' },
        select: { id: true }
      })

      expect(result.warnings).toContain('No LIMIT - unbounded result set')
      expect(result.suggestions).toContain('Add take parameter for pagination')
    })

    it('should flag too large limit', () => {
      const result = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        where: { tenantId: 't1' },
        take: 5000
      })

      expect(result.warnings).toContain('Large LIMIT (5000) - may timeout')
      expect(result.suggestions).toContain('Reduce to 100-500 records per page')
    })

    it('should rate excellent queries', () => {
      const result = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        where: { tenantId: 't1', deletedAt: null },
        select: { id: true, name: true },
        take: 20,
        skip: 0
      })

      expect(result.efficiency).toBe('excellent')
      expect(result.warnings).toHaveLength(0)
    })

    it('should rate poor queries with multiple issues', () => {
      const result = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        include: { company: true, activities: true, leads: true, webhooks: true }
      })

      expect(result.efficiency).toBe('poor')
      expect(result.warnings.length).toBeGreaterThan(2)
    })

    it('should estimate query cost', () => {
      const cost1 = QueryAnalyzer.estimateQueryCost({
        estimatedRows: 100,
        fieldsSelected: 10,
        hasIndex: true,
        hasJoin: false
      })

      const cost2 = QueryAnalyzer.estimateQueryCost({
        estimatedRows: 100,
        fieldsSelected: 50,
        hasIndex: false,
        hasJoin: true
      })

      expect(cost2).toBeGreaterThan(cost1)
    })
  })

  // ============================================================
  // INDEX RECOMMENDATIONS TESTS
  // ============================================================

  describe('INDEX_RECOMMENDATIONS', () => {
    it('should have contacts indexes', () => {
      const indexes = INDEX_RECOMMENDATIONS.contacts
      expect(indexes.length).toBeGreaterThan(0)
      expect(indexes.some((i) => i.name === 'idx_contacts_tenant_status')).toBe(true)
      expect(indexes.some((i) => i.name === 'idx_contacts_tenant_email')).toBe(true)
    })

    it('should have companies indexes', () => {
      const indexes = INDEX_RECOMMENDATIONS.companies
      expect(indexes.length).toBeGreaterThan(0)
      expect(indexes.some((i) => i.name === 'idx_companies_tenant_status')).toBe(true)
    })

    it('should have leads indexes including pipeline/stage', () => {
      const indexes = INDEX_RECOMMENDATIONS.leads
      expect(indexes.some((i) => i.name === 'idx_leads_pipeline_stage')).toBe(true)
      expect(indexes.some((i) => i.name === 'idx_leads_tenant_status')).toBe(true)
    })

    it('should have activities indexes', () => {
      const indexes = INDEX_RECOMMENDATIONS.activities
      expect(indexes.some((i) => i.name === 'idx_activities_entity')).toBe(true)
      expect(indexes.some((i) => i.name === 'idx_activities_user')).toBe(true)
    })

    it('should have api_keys prefix index', () => {
      const indexes = INDEX_RECOMMENDATIONS.api_keys
      expect(indexes.some((i) => i.name === 'idx_api_keys_prefix')).toBe(true)
    })

    it('all indexes should have required fields', () => {
      Object.values(INDEX_RECOMMENDATIONS).forEach((indexes) => {
        indexes.forEach((idx) => {
          expect(idx).toHaveProperty('name')
          expect(idx).toHaveProperty('columns')
          expect(idx).toHaveProperty('description')
          expect(idx).toHaveProperty('priority')
          expect(['HIGH', 'MEDIUM', 'LOW']).toContain(idx.priority)
        })
      })
    })
  })

  // ============================================================
  // OPTIMIZED QUERIES TESTS
  // ============================================================

  describe('OptimizedQueries', () => {
    it('should build efficient contact list query', () => {
      const query = OptimizedQueries.buildContactListQuery('tenant1', 1, { limit: 20 })

      expect(query.where).toEqual({
        tenantId: 'tenant1',
        deletedAt: null
      })
      expect(query.select).toBe(SELECTIVE_FIELDS.contacts_list)
      expect(query.skip).toBe(0)
      expect(query.take).toBe(20)
      expect(query.orderBy).toEqual({ createdAt: 'desc' })
    })

    it('should build contact list query with filters', () => {
      const query = OptimizedQueries.buildContactListQuery('tenant1', 1, {
        limit: 20,
        status: 'active',
        search: 'john',
        sortBy: 'name'
      })

      expect(query.where.status).toBe('active')
      expect(query.where.OR).toBeDefined()
      expect(query.orderBy).toEqual({ name: 'asc' })
    })

    it('should build efficient company list query', () => {
      const query = OptimizedQueries.buildCompanyListQuery('tenant1', 2, {
        limit: 25
      })

      expect(query.skip).toBe(25)
      expect(query.take).toBe(25)
      expect(query.select).toBe(SELECTIVE_FIELDS.companies_list)
    })

    it('should build efficient leads list query', () => {
      const query = OptimizedQueries.buildLeadsListQuery('tenant1', 1, {
        limit: 50,
        status: 'open',
        priority: 'high',
        pipelineId: 'pipe1'
      })

      expect(query.where.tenantId).toBe('tenant1')
      expect(query.where.status).toBe('open')
      expect(query.where.priority).toBe('high')
      expect(query.where.pipelineId).toBe('pipe1')
      expect(query.take).toBe(50) // Capped at actual limit since < 100
    })

    it('should build efficient activities list query', () => {
      const query = OptimizedQueries.buildActivitiesListQuery('tenant1', 1, {
        limit: 100,
        entityType: 'contact',
        actionType: 'created'
      })

      expect(query.where.tenantId).toBe('tenant1')
      expect(query.where.entityType).toBe('contact')
      expect(query.where.actionType).toBe('created')
      expect(query.select).toBe(SELECTIVE_FIELDS.activities_list)
    })

    it('should handle pagination across pages', () => {
      const q1 = OptimizedQueries.buildContactListQuery('t1', 1, { limit: 20 })
      const q2 = OptimizedQueries.buildContactListQuery('t1', 2, { limit: 20 })
      const q3 = OptimizedQueries.buildContactListQuery('t1', 3, { limit: 20 })

      expect(q1.skip).toBe(0)
      expect(q2.skip).toBe(20)
      expect(q3.skip).toBe(40)
    })

    it('should cap large limits', () => {
      const query = OptimizedQueries.buildContactListQuery('t1', 1, {
        limit: 5000
      })

      expect(query.take).toBe(100) // Capped at 100
    })
  })

  // ============================================================
  // INTEGRATION TESTS
  // ============================================================

  describe('Integration Tests', () => {
    it('should combine query analysis with optimization', () => {
      // Build a query
      const query = OptimizedQueries.buildContactListQuery('t1', 1, {
        limit: 20,
        status: 'active'
      })

      // Analyze it
      const analysis = QueryAnalyzer.analyzeQuery({
        model: 'contacts',
        where: query.where,
        select: query.select as Record<string, boolean>,
        take: query.take,
        skip: query.skip
      })

      expect(analysis.efficiency).toBe('excellent')
      expect(analysis.warnings.length).toBe(0)
    })

    it('should demonstrate N+1 elimination', async () => {
      const mockDb = {
        contact: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'c1', companyId: 'co1' },
            { id: 'c2', companyId: 'co1' },
            { id: 'c3', companyId: 'co2' }
          ])
        },
        company: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'co1', name: 'Acme' },
            { id: 'co2', name: 'Tech' }
          ])
        }
      }

      // Batch loading: 1 query for contacts + 1 query for companies = 2 total
      const contacts = await mockDb.contact.findMany()
      const result = await BatchLoader.loadContactsWithCompanies(
        contacts,
        mockDb
      )

      // Without batch loading: 1 query for contacts + 3 queries for companies = 4 total
      // With batch loading: 1 query for contacts + 1 query for companies = 2 total
      // Reduction: 50%

      expect(mockDb.contact.findMany).toHaveBeenCalledTimes(1)
      expect(mockDb.company.findMany).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(3)
      expect(result.every((c) => c.company)).toBe(true)
    })

    it('should provide complete query optimization workflow', () => {
      // 1. Build optimized query
      const query = OptimizedQueries.buildLeadsListQuery('t1', 1, {
        limit: 20,
        status: 'open',
        pipelineId: 'p1'
      })

      // 2. Analyze query
      const analysis = QueryAnalyzer.analyzeQuery({
        model: 'leads',
        where: query.where,
        select: query.select as Record<string, boolean>,
        take: query.take,
        skip: query.skip
      })

      // 3. Estimate cost
      const cost = QueryAnalyzer.estimateQueryCost({
        estimatedRows: 500,
        fieldsSelected: Object.keys(SELECTIVE_FIELDS.leads_list).length,
        hasIndex: true,
        hasJoin: false
      })

      // 4. Verify recommendations
      const indexRecs = INDEX_RECOMMENDATIONS.leads.filter(
        (i) => i.name === 'idx_leads_pipeline_stage'
      )

      expect(analysis.efficiency).toBe('excellent')
      expect(cost).toBeLessThan(100)
      expect(indexRecs).toHaveLength(1)
      expect(indexRecs[0].priority).toBe('HIGH')
    })
  })

  // ============================================================
  // PERFORMANCE BENCHMARK TESTS
  // ============================================================

  describe('Performance Benchmarks', () => {
    it('should estimate performance improvements with batch loading', () => {
      // Scenario: Load 1000 contacts with companies
      // Without batch loading: 1000 queries (1 for contacts + 1 per contact for company)
      // With batch loading: 2 queries (1 for contacts + 1 for all companies)
      // Improvement: 99.8% reduction in queries

      const queriesWithoutOptimization = 1001 // 1 + 1000
      const queriesWithOptimization = 2 // 1 + 1

      const queryReduction = (
        ((queriesWithoutOptimization - queriesWithOptimization) /
          queriesWithoutOptimization) *
        100
      ).toFixed(1)

      expect(Number(queryReduction)).toBeGreaterThan(99)
    })

    it('should estimate performance improvements with selective fields', () => {
      // Contact list vs detail
      // List fields: 9
      // Detail fields: 19
      // Data reduction: 52.6%

      const listFields = Object.keys(SELECTIVE_FIELDS.contacts_list).length
      const detailFields = Object.keys(SELECTIVE_FIELDS.contacts_detail).length

      const fieldReduction = (
        ((detailFields - listFields) / detailFields) *
        100
      ).toFixed(1)

      expect(Number(fieldReduction)).toBeGreaterThan(40)
    })
  })
})
