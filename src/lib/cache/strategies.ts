/**
 * Cache Strategies - Phase 2.2a
 * Different caching patterns for various endpoint types
 */

import { getCache, CACHE_TTL, CACHE_KEYS, invalidateCachePattern } from './index'

/**
 * Strategy 1: List Endpoint Caching
 * Used for paginated list endpoints
 */
export class ListCacheStrategy {
  /**
   * Get cached list or fetch and cache
   */
  static async getOrFetch<T>(
    tenantId: string,
    page: number,
    resource: string,
    fetchFn: () => Promise<{ items: T[]; total: number }>
  ) {
    const cache = getCache()
    const cacheKey = `${resource}:${tenantId}:p${page}`
    const ttl = CACHE_TTL[resource as keyof typeof CACHE_TTL] || CACHE_TTL.DEFAULT

    // Try cache first
    const cached = cache.get<{ items: T[]; total: number }>(cacheKey)
    if (cached) {
      return { ...cached, fromCache: true }
    }

    // Fetch and cache
    const result = await fetchFn()
    cache.set(cacheKey, result, ttl)

    return { ...result, fromCache: false }
  }

  /**
   * Invalidate all pages for a resource
   */
  static invalidateResource(tenantId: string, resource: string): number {
    const cache = getCache()
    return cache.deletePattern(`${resource}:${tenantId}:p*`)
  }
}

/**
 * Strategy 2: Detail Endpoint Caching
 * Used for individual resource detail endpoints
 */
export class DetailCacheStrategy {
  /**
   * Get cached detail or fetch and cache
   */
  static async getOrFetch<T>(
    tenantId: string,
    resourceId: string,
    resource: string,
    fetchFn: () => Promise<T>
  ) {
    const cache = getCache()
    const cacheKey = `${resource}:${tenantId}:${resourceId}`
    const ttl = CACHE_TTL[`${resource}_DETAIL` as keyof typeof CACHE_TTL] || CACHE_TTL.DEFAULT

    // Try cache first
    const cached = cache.get<T>(cacheKey)
    if (cached) {
      return { data: cached, fromCache: true }
    }

    // Fetch and cache
    const result = await fetchFn()
    cache.set(cacheKey, result, ttl)

    return { data: result, fromCache: false }
  }

  /**
   * Invalidate specific resource
   */
  static invalidateResource(tenantId: string, resourceId: string, resource: string): boolean {
    const cache = getCache()
    const cacheKey = `${resource}:${tenantId}:${resourceId}`
    return cache.delete(cacheKey)
  }

  /**
   * Invalidate all instances of a resource
   */
  static invalidateAllResources(tenantId: string, resource: string): number {
    const cache = getCache()
    return cache.deletePattern(`${resource}:${tenantId}:*`)
  }
}

/**
 * Strategy 3: Analytics Caching
 * Special strategy for expensive analytics queries
 */
export class AnalyticsCacheStrategy {
  /**
   * Get cached analytics or compute and cache
   */
  static async getOrCompute<T>(
    tenantId: string,
    metric: string,
    period: string,
    computeFn: () => Promise<T>
  ) {
    const cache = getCache()
    const cacheKey = `analytics:${tenantId}:${metric}:${period}`
    // Analytics has longer TTL (10 minutes)
    const ttl = CACHE_TTL.ANALYTICS

    // Try cache first
    const cached = cache.get<T>(cacheKey)
    if (cached) {
      return { data: cached, fromCache: true }
    }

    // Compute and cache
    const result = await computeFn()
    cache.set(cacheKey, result, ttl)

    return { data: result, fromCache: false }
  }

  /**
   * Invalidate analytics for a tenant (when data changes)
   */
  static invalidateTenantAnalytics(tenantId: string): number {
    const cache = getCache()
    return cache.deletePattern(`analytics:${tenantId}:*`)
  }

  /**
   * Invalidate specific metric
   */
  static invalidateMetric(tenantId: string, metric: string): number {
    const cache = getCache()
    return cache.deletePattern(`analytics:${tenantId}:${metric}:*`)
  }
}

/**
 * Strategy 4: Search Result Caching
 * Used for expensive search queries
 */
export class SearchCacheStrategy {
  /**
   * Get cached search results or search and cache
   */
  static async getOrSearch<T>(
    tenantId: string,
    searchQuery: string,
    searchFn: () => Promise<T[]>
  ) {
    const cache = getCache()
    const queryHash = require('crypto')
      .createHash('md5')
      .update(searchQuery)
      .digest('hex')
      .substring(0, 8)
    const cacheKey = `search:${tenantId}:${queryHash}`
    const ttl = CACHE_TTL.SEARCH_RESULTS

    // Try cache first
    const cached = cache.get<T[]>(cacheKey)
    if (cached) {
      return { results: cached, fromCache: true }
    }

    // Search and cache
    const results = await searchFn()
    cache.set(cacheKey, results, ttl)

    return { results, fromCache: false }
  }

  /**
   * Invalidate search cache for tenant
   */
  static invalidateTenantSearch(tenantId: string): number {
    const cache = getCache()
    return cache.deletePattern(`search:${tenantId}:*`)
  }
}

/**
 * Strategy 5: Write-Through Caching
 * Used for mutations that should also update cache
 */
export class WriteThroughCacheStrategy {
  /**
   * Update resource and invalidate cache
   */
  static async updateAndInvalidate<T>(
    tenantId: string,
    resourceId: string,
    resource: string,
    updateFn: () => Promise<T>
  ) {
    // Execute update
    const result = await updateFn()

    // Invalidate cache
    const cache = getCache()
    cache.delete(`${resource}:${tenantId}:${resourceId}`)
    cache.deletePattern(`${resource}:${tenantId}:p*`)

    return result
  }

  /**
   * Delete resource and invalidate cache
   */
  static async deleteAndInvalidate(
    tenantId: string,
    resourceId: string,
    resource: string,
    deleteFn: () => Promise<boolean>
  ) {
    // Execute delete
    const result = await deleteFn()

    if (result) {
      // Invalidate cache
      const cache = getCache()
      cache.delete(`${resource}:${tenantId}:${resourceId}`)
      cache.deletePattern(`${resource}:${tenantId}:p*`)
    }

    return result
  }

  /**
   * Create resource and seed cache
   */
  static async createAndCache<T>(
    tenantId: string,
    resource: string,
    createFn: () => Promise<T>
  ) {
    // Execute create
    const result = await createFn()

    // Invalidate list cache (it's now stale)
    const cache = getCache()
    cache.deletePattern(`${resource}:${tenantId}:p*`)

    return result
  }
}

/**
 * Strategy 6: Distributed Cache Warming
 * Pre-load frequently accessed data
 */
export class CacheWarmingStrategy {
  /**
   * Warm cache for frequently accessed data
   */
  static async warmCache<T>(
    tenantId: string,
    resources: Array<{ key: string; ttl: number; fetchFn: () => Promise<T> }>
  ) {
    const cache = getCache()
    const results: Array<{ key: string; status: string; error?: unknown }> = []

    for (const { key, ttl, fetchFn } of resources) {
      try {
        const data = await fetchFn()
        cache.set(key, data, ttl)
        results.push({ key, status: 'warmed' })
      } catch (error) {
        results.push({ key, status: 'failed', error })
      }
    }

    return results
  }

  /**
   * Warm cache on tenant onboarding
   */
  static async warmTenantCache(tenantId: string, fetchFunctions: {
    contacts?: () => Promise<any>
    companies?: () => Promise<any>
    leads?: () => Promise<any>
  }): Promise<Record<string, any>> {
    const cache = getCache()
    const results: Record<string, any> = {}

    if (fetchFunctions.contacts) {
      try {
        const data = await fetchFunctions.contacts()
        cache.set(CACHE_KEYS.CONTACTS(tenantId, 1), data, CACHE_TTL.CONTACTS_LIST)
        results.contacts = 'warmed'
      } catch (error) {
        results.contacts = 'failed'
      }
    }

    if (fetchFunctions.companies) {
      try {
        const data = await fetchFunctions.companies()
        cache.set(CACHE_KEYS.COMPANIES(tenantId, 1), data, CACHE_TTL.COMPANIES_LIST)
        results.companies = 'warmed'
      } catch (error) {
        results.companies = 'failed'
      }
    }

    if (fetchFunctions.leads) {
      try {
        const data = await fetchFunctions.leads()
        cache.set(CACHE_KEYS.LEADS(tenantId, 1), data, CACHE_TTL.LEADS_LIST)
        results.leads = 'warmed'
      } catch (error) {
        results.leads = 'failed'
      }
    }

    return results
  }
}

/**
 * Strategy 7: Cache Invalidation on Related Changes
 * Invalidate related caches when one resource changes
 */
export class CascadingInvalidationStrategy {
  /**
   * When contact is updated, invalidate related caches
   */
  static invalidateOnContactUpdate(tenantId: string, contactId: string): number {
    const cache = getCache()
    let count = 0

    // Invalidate contact detail
    count += cache.delete(`contact:${tenantId}:${contactId}`) ? 1 : 0

    // Invalidate contact lists
    count += cache.deletePattern(`contact:${tenantId}:p*`)

    // Invalidate search results (contacts might appear in search)
    count += cache.deletePattern(`search:${tenantId}:*`)

    // Invalidate analytics (contact metrics changed)
    count += cache.deletePattern(`analytics:${tenantId}:CONTACTS_*`)

    return count
  }

  /**
   * When company is updated, invalidate related caches
   */
  static invalidateOnCompanyUpdate(tenantId: string, companyId: string): number {
    const cache = getCache()
    let count = 0

    // Invalidate company detail
    count += cache.delete(`company:${tenantId}:${companyId}`) ? 1 : 0

    // Invalidate company lists
    count += cache.deletePattern(`company:${tenantId}:p*`)

    // Invalidate search
    count += cache.deletePattern(`search:${tenantId}:*`)

    // Invalidate analytics
    count += cache.deletePattern(`analytics:${tenantId}:COMPANIES_*`)

    return count
  }

  /**
   * When lead is updated, invalidate related caches
   */
  static invalidateOnLeadUpdate(tenantId: string, leadId: string): number {
    const cache = getCache()
    let count = 0

    // Invalidate lead detail
    count += cache.delete(`lead:${tenantId}:${leadId}`) ? 1 : 0

    // Invalidate lead lists
    count += cache.deletePattern(`lead:${tenantId}:p*`)

    // Invalidate search
    count += cache.deletePattern(`search:${tenantId}:*`)

    // Invalidate analytics
    count += cache.deletePattern(`analytics:${tenantId}:LEADS_*`)
    count += cache.deletePattern(`analytics:${tenantId}:CONVERSION_*`)
    count += cache.deletePattern(`analytics:${tenantId}:PIPELINE_*`)

    return count
  }
}
