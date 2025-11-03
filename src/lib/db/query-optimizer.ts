/**
 * Query Optimizer - Phase 2.2b
 * Implements query optimization patterns:
 * - Selective field queries (avoid SELECT *)
 * - Batch loading (eliminate N+1)
 * - Index-friendly queries
 * - Query hints and performance tips
 */

/**
 * Query Optimization Strategies
 */

/**
 * 1. Selective Fields - Only fetch needed columns
 * Reduces data transfer and improves cache efficiency
 */
export const SELECTIVE_FIELDS = {
  // Contact list view - minimal fields
  contacts_list: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    status: true,
    companyId: true,
    createdAt: true,
    updatedAt: true
    // Excluded: address, notes, customFields, metadata
  },

  // Contact detail view - all fields
  contacts_detail: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    title: true,
    status: true,
    address: true,
    city: true,
    state: true,
    postalCode: true,
    country: true,
    notes: true,
    customFields: true,
    metadata: true,
    companyId: true,
    createdAt: true,
    updatedAt: true
  },

  // Company list view - minimal fields
  companies_list: {
    id: true,
    name: true,
    domain: true,
    industry: true,
    size: true,
    status: true,
    createdAt: true,
    updatedAt: true
    // Excluded: description, address, customFields
  },

  // Company detail view - all fields
  companies_detail: {
    id: true,
    name: true,
    domain: true,
    industry: true,
    size: true,
    description: true,
    address: true,
    city: true,
    state: true,
    postalCode: true,
    country: true,
    phone: true,
    website: true,
    status: true,
    customFields: true,
    metadata: true,
    createdAt: true,
    updatedAt: true
  },

  // Leads list view - minimal fields
  leads_list: {
    id: true,
    title: true,
    status: true,
    priority: true,
    source: true,
    value: true,
    pipelineId: true,
    stageId: true,
    contactId: true,
    createdAt: true,
    updatedAt: true
    // Excluded: description, notes, customFields
  },

  // Leads detail view - all fields
  leads_detail: {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    source: true,
    value: true,
    expectedCloseDate: true,
    actualCloseDate: true,
    pipelineId: true,
    stageId: true,
    contactId: true,
    notes: true,
    customFields: true,
    metadata: true,
    createdAt: true,
    updatedAt: true
  },

  // Activities list view - minimal fields
  activities_list: {
    id: true,
    entityType: true,
    actionType: true,
    entityId: true,
    userId: true,
    description: true,
    createdAt: true
    // Excluded: changes, metadata
  },

  // Activities detail view - all fields
  activities_detail: {
    id: true,
    entityType: true,
    actionType: true,
    entityId: true,
    userId: true,
    description: true,
    changes: true,
    metadata: true,
    createdAt: true,
    updatedAt: true
  },

  // Analytics view - aggregated fields only
  analytics_summary: {
    id: true,
    metric: true,
    value: true,
    trend: true,
    change: true,
    period: true,
    createdAt: true
  },

  // Reports list view
  reports_list: {
    id: true,
    name: true,
    type: true,
    status: true,
    createdBy: true,
    createdAt: true,
    nextScheduledFor: true
    // Excluded: filters, metrics, data
  },

  // Reports detail view
  reports_detail: {
    id: true,
    name: true,
    type: true,
    description: true,
    status: true,
    filters: true,
    metrics: true,
    schedule: true,
    recipients: true,
    createdBy: true,
    createdAt: true,
    generatedAt: true,
    nextScheduledFor: true
  }
} as const

/**
 * 2. Batch Loading - Load related data efficiently
 * Instead of N queries, do 1+1 queries
 */
export class BatchLoader {
  /**
   * Load contacts with their companies
   * Instead of: query contacts, then for each contact query company (N+1)
   * Do: query contacts, then batch query all companies (1+1)
   */
  static async loadContactsWithCompanies<T extends { id: string; companyId?: string }>(
    contacts: T[],
    db: any
  ) {
    // Get all unique company IDs
    const companyIds = new Set(
      contacts
        .filter((c) => c.companyId)
        .map((c) => c.companyId)
    )

    // Batch load all companies
    const companies = await db.company.findMany({
      where: { id: { in: Array.from(companyIds) } },
      select: {
        id: true,
        name: true,
        domain: true,
        industry: true
      }
    })

    // Create lookup map
    const companiesMap = new Map(companies.map((c) => [c.id, c]))

    // Attach companies to contacts
    return contacts.map((contact) => ({
      ...contact,
      company: contact.companyId ? companiesMap.get(contact.companyId) : null
    }))
  }

  /**
   * Load leads with their pipelines and stages
   */
  static async loadLeadsWithPipelineAndStage<T extends { id: string; pipelineId?: string; stageId?: string }>(
    leads: T[],
    db: any
  ) {
    // Get unique IDs
    const pipelineIds = new Set(leads.filter((l) => l.pipelineId).map((l) => l.pipelineId))
    const stageIds = new Set(leads.filter((l) => l.stageId).map((l) => l.stageId))

    // Batch load
    const [pipelines, stages] = await Promise.all([
      db.pipeline.findMany({
        where: { id: { in: Array.from(pipelineIds) } },
        select: { id: true, name: true, description: true }
      }),
      db.stage.findMany({
        where: { id: { in: Array.from(stageIds) } },
        select: { id: true, name: true, probability: true }
      })
    ])

    // Create lookup maps
    const pipelinesMap = new Map(pipelines.map((p) => [p.id, p]))
    const stagesMap = new Map(stages.map((s) => [s.id, s]))

    // Attach to leads
    return leads.map((lead) => ({
      ...lead,
      pipeline: lead.pipelineId ? pipelinesMap.get(lead.pipelineId) : null,
      stage: lead.stageId ? stagesMap.get(lead.stageId) : null
    }))
  }

  /**
   * Load activities with user information
   */
  static async loadActivitiesWithUsers<T extends { id: string; userId?: string }>(
    activities: T[],
    db: any
  ) {
    const userIds = new Set(
      activities
        .filter((a) => a.userId)
        .map((a) => a.userId)
    )

    // Batch load users
    const users = await db.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    })

    const usersMap = new Map(users.map((u) => [u.id, u]))

    // Attach to activities
    return activities.map((activity) => ({
      ...activity,
      user: activity.userId ? usersMap.get(activity.userId) : null
    }))
  }

  /**
   * Generic batch loader
   */
  static async batchLoad<T extends Record<string, any>>(
    items: T[],
    relationField: keyof T,
    db: any,
    model: string,
    selectFields: Record<string, boolean>
  ) {
    // Get unique IDs
    const ids = new Set(
      items
        .filter((item) => item[relationField])
        .map((item) => item[relationField] as string)
    )

    // Batch load related items
    const related = await (db[model] as any).findMany({
      where: { id: { in: Array.from(ids) } },
      select: selectFields
    })

    // Create lookup map
    const relatedMap = new Map(related.map((r: any) => [r.id, r]))

    // Attach to items
    return items.map((item) => ({
      ...item,
      [relationField]: relatedMap.get(item[relationField] as string) || null
    }))
  }
}

/**
 * 3. Query Hints - Optimize query construction
 */
export class QueryHints {
  /**
   * Use filtered index for soft deletes
   */
  static withoutDeleted(whereClause: Record<string, any>) {
    return {
      ...whereClause,
      deletedAt: null
    }
  }

  /**
   * Add limit to prevent large result sets
   */
  static withLimit(limit: number, maxLimit: number = 100) {
    return Math.min(limit, maxLimit)
  }

  /**
   * Build efficient WHERE clause
   */
  static buildWhereClause(
    tenantId: string,
    filters: Record<string, any>
  ): Record<string, any> {
    const where: Record<string, any> = {
      tenantId,
      deletedAt: null
    }

    // Add status filter if provided
    if (filters.status) {
      where.status = filters.status
    }

    // Add search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { domain: { contains: filters.search, mode: 'insensitive' } }
      ]
    }

    // Add date range
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {}
      if (filters.fromDate) {
        where.createdAt.gte = new Date(filters.fromDate)
      }
      if (filters.toDate) {
        where.createdAt.lte = new Date(filters.toDate)
      }
    }

    return where
  }

  /**
   * Optimize pagination
   */
  static getPaginationParams(page: number, limit: number) {
    const actualLimit = Math.min(limit, 100) // Max 100 per page
    const skip = (Math.max(1, page) - 1) * actualLimit

    return { skip, take: actualLimit }
  }

  /**
   * Get optimal sort order
   * Queries should sort by indexed columns when possible
   */
  static getOptimalOrderBy(sortBy?: string) {
    const validSorts: Record<string, any> = {
      'newest': { createdAt: 'desc' },
      'oldest': { createdAt: 'asc' },
      'name': { name: 'asc' },
      'name-desc': { name: 'desc' },
      'status': { status: 'asc' },
      'updated': { updatedAt: 'desc' }
    }

    return validSorts[sortBy || 'newest'] || { createdAt: 'desc' }
  }
}

/**
 * 4. Query Performance Analyzer
 */
export class QueryAnalyzer {
  /**
   * Analyze query efficiency
   */
  static analyzeQuery(query: {
    model: string
    select?: Record<string, boolean>
    where?: Record<string, any>
    include?: Record<string, any>
    take?: number
    skip?: number
  }): {
    efficiency: 'excellent' | 'good' | 'fair' | 'poor'
    warnings: string[]
    suggestions: string[]
  } {
    const warnings: string[] = []
    const suggestions: string[] = []

    // Check for SELECT *
    if (!query.select) {
      warnings.push('No select clause - fetching all fields')
      suggestions.push('Use selective fields to reduce data transfer')
    }

    // Check for nested includes
    if (query.include) {
      const includeCount = Object.keys(query.include).length
      if (includeCount > 3) {
        warnings.push(`Too many includes (${includeCount}) - risk of N+1 queries`)
        suggestions.push('Use batch loading instead of nested includes')
      }
    }

    // Check for missing WHERE clause
    if (!query.where) {
      warnings.push('No WHERE clause - will fetch all records')
      suggestions.push('Add tenant_id and deletedAt to WHERE clause')
    }

    // Check pagination
    if (!query.take) {
      warnings.push('No LIMIT - unbounded result set')
      suggestions.push('Add take parameter for pagination')
    } else if ((query.take || 0) > 1000) {
      warnings.push(`Large LIMIT (${query.take}) - may timeout`)
      suggestions.push('Reduce to 100-500 records per page')
    }

    // Calculate efficiency
    let efficiency: 'excellent' | 'good' | 'fair' | 'poor' = 'excellent'
    if (warnings.length > 2) efficiency = 'poor'
    else if (warnings.length > 1) efficiency = 'fair'
    else if (warnings.length > 0) efficiency = 'good'

    return { efficiency, warnings, suggestions }
  }

  /**
   * Get query cost estimate
   */
  static estimateQueryCost(query: {
    estimatedRows?: number
    fieldsSelected?: number
    hasIndex?: boolean
    hasJoin?: boolean
  }): number {
    let cost = 0

    // Base cost per row
    cost += (query.estimatedRows || 100) * 0.1

    // Penalty for selecting many fields
    cost += (query.fieldsSelected || 10) * 5

    // Penalty for joins
    if (query.hasJoin) cost *= 2

    // Discount for indexed queries
    if (query.hasIndex) cost *= 0.5

    return Math.round(cost)
  }
}

/**
 * 5. Index Recommendations
 */
export const INDEX_RECOMMENDATIONS = {
  // Contacts table
  contacts: [
    {
      name: 'idx_contacts_tenant_status',
      columns: ['tenant_id', 'status', 'created_at'],
      description: 'For status filtering and sorting',
      priority: 'HIGH'
    },
    {
      name: 'idx_contacts_tenant_email',
      columns: ['tenant_id', 'email'],
      description: 'For email lookups',
      priority: 'HIGH'
    },
    {
      name: 'idx_contacts_tenant_created',
      columns: ['tenant_id', 'created_at'],
      description: 'For date filtering',
      priority: 'MEDIUM'
    },
    {
      name: 'idx_contacts_company',
      columns: ['company_id', 'tenant_id'],
      description: 'For company lookups',
      priority: 'MEDIUM'
    }
  ],

  // Companies table
  companies: [
    {
      name: 'idx_companies_tenant_status',
      columns: ['tenant_id', 'status', 'created_at'],
      description: 'For status filtering',
      priority: 'HIGH'
    },
    {
      name: 'idx_companies_tenant_domain',
      columns: ['tenant_id', 'domain'],
      description: 'For domain lookups',
      priority: 'HIGH'
    },
    {
      name: 'idx_companies_tenant_industry',
      columns: ['tenant_id', 'industry', 'created_at'],
      description: 'For industry segmentation',
      priority: 'MEDIUM'
    }
  ],

  // Leads table
  leads: [
    {
      name: 'idx_leads_pipeline_stage',
      columns: ['pipeline_id', 'stage_id', 'created_at'],
      description: 'For pipeline board view',
      priority: 'HIGH'
    },
    {
      name: 'idx_leads_tenant_status',
      columns: ['tenant_id', 'status', 'created_at'],
      description: 'For status filtering',
      priority: 'HIGH'
    },
    {
      name: 'idx_leads_tenant_priority',
      columns: ['tenant_id', 'priority', 'created_at'],
      description: 'For priority filtering',
      priority: 'MEDIUM'
    },
    {
      name: 'idx_leads_contact',
      columns: ['contact_id', 'tenant_id'],
      description: 'For contact lookups',
      priority: 'MEDIUM'
    }
  ],

  // Activities table
  activities: [
    {
      name: 'idx_activities_entity',
      columns: ['entity_type', 'entity_id', 'tenant_id', 'created_at'],
      description: 'For entity activity tracking',
      priority: 'HIGH'
    },
    {
      name: 'idx_activities_user',
      columns: ['user_id', 'tenant_id', 'created_at'],
      description: 'For user activity feed',
      priority: 'HIGH'
    },
    {
      name: 'idx_activities_tenant_date',
      columns: ['tenant_id', 'created_at'],
      description: 'For audit trail by date',
      priority: 'MEDIUM'
    }
  ],

  // Webhooks table
  webhooks: [
    {
      name: 'idx_webhooks_tenant_active',
      columns: ['tenant_id', 'is_active'],
      description: 'For webhook filtering',
      priority: 'MEDIUM'
    }
  ],

  // API Keys table
  api_keys: [
    {
      name: 'idx_api_keys_tenant',
      columns: ['tenant_id', 'created_at'],
      description: 'For API key listing',
      priority: 'MEDIUM'
    },
    {
      name: 'idx_api_keys_prefix',
      columns: ['key_prefix'],
      description: 'For key lookup',
      priority: 'HIGH'
    }
  ]
} as const

/**
 * 6. Query Execution Helpers
 */
export class OptimizedQueries {
  /**
   * Efficient contact listing query
   */
  static buildContactListQuery(tenantId: string, page: number, filters: any) {
    const { skip, take } = QueryHints.getPaginationParams(page, filters.limit || 20)
    const where = QueryHints.buildWhereClause(tenantId, filters)
    const orderBy = QueryHints.getOptimalOrderBy(filters.sortBy)

    return {
      where,
      select: SELECTIVE_FIELDS.contacts_list,
      skip,
      take,
      orderBy
    }
  }

  /**
   * Efficient company listing query
   */
  static buildCompanyListQuery(tenantId: string, page: number, filters: any) {
    const { skip, take } = QueryHints.getPaginationParams(page, filters.limit || 20)
    const where = QueryHints.buildWhereClause(tenantId, filters)
    const orderBy = QueryHints.getOptimalOrderBy(filters.sortBy)

    return {
      where,
      select: SELECTIVE_FIELDS.companies_list,
      skip,
      take,
      orderBy
    }
  }

  /**
   * Efficient leads listing query
   */
  static buildLeadsListQuery(tenantId: string, page: number, filters: any) {
    const { skip, take } = QueryHints.getPaginationParams(page, filters.limit || 20)
    const where = {
      tenantId,
      deletedAt: null,
      ...(filters.status && { status: filters.status }),
      ...(filters.priority && { priority: filters.priority }),
      ...(filters.pipelineId && { pipelineId: filters.pipelineId })
    }
    const orderBy = QueryHints.getOptimalOrderBy(filters.sortBy)

    return {
      where,
      select: SELECTIVE_FIELDS.leads_list,
      skip,
      take,
      orderBy
    }
  }

  /**
   * Efficient activities listing query
   */
  static buildActivitiesListQuery(tenantId: string, page: number, filters: any) {
    const { skip, take } = QueryHints.getPaginationParams(page, filters.limit || 20)
    const where = {
      tenantId,
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.actionType && { actionType: filters.actionType }),
      ...(filters.entityId && { entityId: filters.entityId }),
      ...(filters.userId && { userId: filters.userId })
    }
    const orderBy = { createdAt: 'desc' as const }

    return {
      where,
      select: SELECTIVE_FIELDS.activities_list,
      skip,
      take,
      orderBy
    }
  }
}
