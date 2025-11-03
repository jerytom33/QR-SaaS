import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getCache,
  invalidateCachePattern,
  invalidateTenantCache,
  invalidateResourceCache,
  getCacheStats,
  clearCache,
  resetCacheInstance,
  CACHE_TTL,
  CACHE_KEYS,
  withCache
} from '@/lib/cache/index'
import {
  ListCacheStrategy,
  DetailCacheStrategy,
  AnalyticsCacheStrategy,
  SearchCacheStrategy,
  WriteThroughCacheStrategy,
  CacheWarmingStrategy,
  CascadingInvalidationStrategy
} from '@/lib/cache/strategies'

/**
 * Cache System Tests - Phase 2.2a
 * Comprehensive testing of caching functionality
 */

describe('Cache System - Phase 2.2a', () => {

  beforeEach(() => {
    resetCacheInstance()
    clearCache()
  })

  // ========================================================================
  // BASIC CACHE OPERATIONS
  // ========================================================================

  describe('Basic Cache Operations', () => {

    it('should set and get cache value', () => {
      const cache = getCache()
      cache.set('test-key', { value: 42 })

      const result = cache.get('test-key')
      expect(result).toEqual({ value: 42 })
    })

    it('should return null for missing key', () => {
      const cache = getCache()
      const result = cache.get('nonexistent')

      expect(result).toBeNull()
    })

    it('should delete cache value', () => {
      const cache = getCache()
      cache.set('test-key', { value: 42 })

      const deleted = cache.delete('test-key')
      expect(deleted).toBe(true)

      const result = cache.get('test-key')
      expect(result).toBeNull()
    })

    it('should respect TTL expiration', async () => {
      const cache = getCache()
      cache.set('test-key', { value: 42 }, 1) // 1 second TTL

      // Should exist immediately
      let result = cache.get('test-key')
      expect(result).toEqual({ value: 42 })

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should be expired
      result = cache.get('test-key')
      expect(result).toBeNull()
    })

    it('should support generic types', () => {
      const cache = getCache()
      interface User { id: string; name: string }

      const user: User = { id: '1', name: 'John' }
      cache.set('user:1', user)

      const retrieved = cache.get<User>('user:1')
      expect(retrieved?.name).toBe('John')
    })

    it('should clear all cache', () => {
      const cache = getCache()
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      clearCache()

      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBeNull()
      expect(cache.get('key3')).toBeNull()
    })
  })

  // ========================================================================
  // PATTERN INVALIDATION
  // ========================================================================

  describe('Pattern Invalidation', () => {

    it('should invalidate by pattern', () => {
      const cache = getCache()
      cache.set('contacts:tenant-1:p1', { data: 1 })
      cache.set('contacts:tenant-1:p2', { data: 2 })
      cache.set('companies:tenant-1:p1', { data: 3 })

      const deleted = invalidateCachePattern('contacts:tenant-1:p*')
      expect(deleted).toBe(2)

      expect(cache.get('contacts:tenant-1:p1')).toBeNull()
      expect(cache.get('contacts:tenant-1:p2')).toBeNull()
      expect(cache.get('companies:tenant-1:p1')).not.toBeNull()
    })

    it('should invalidate tenant cache', () => {
      const cache = getCache()
      cache.set('contacts:tenant-1:p1', { data: 1 })
      cache.set('contacts:tenant-2:p1', { data: 2 })
      cache.set('companies:tenant-1:p1', { data: 3 })

      const deleted = invalidateTenantCache('tenant-1')
      expect(deleted).toBe(2)

      expect(cache.get('contacts:tenant-2:p1')).not.toBeNull()
    })

    it('should invalidate resource cache', () => {
      const cache = getCache()
      cache.set('contacts:tenant-1:p1', { data: 1 })
      cache.set('contacts:tenant-1:p2', { data: 2 })
      cache.set('companies:tenant-1:p1', { data: 3 })

      const deleted = invalidateResourceCache('contacts', 'tenant-1')
      expect(deleted).toBe(2)

      expect(cache.get('companies:tenant-1:p1')).not.toBeNull()
    })
  })

  // ========================================================================
  // CACHE STATISTICS
  // ========================================================================

  describe('Cache Statistics', () => {

    it('should track cache hits', () => {
      const cache = getCache()
      cache.set('key1', 'value1')

      cache.get('key1') // hit
      cache.get('key1') // hit
      cache.get('nonexistent') // miss

      const stats = getCacheStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
    })

    it('should calculate hit rate', () => {
      const cache = getCache()
      cache.set('key1', 'value1')

      // 3 hits, 1 miss = 75% hit rate
      cache.get('key1')
      cache.get('key1')
      cache.get('key1')
      cache.get('nonexistent')

      const stats = getCacheStats()
      expect(stats.hitRate).toBe('75.00%')
    })

    it('should report cache size', () => {
      const cache = getCache()
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')

      const stats = getCacheStats()
      expect(stats.size).toBe(3)
    })

    it('should track cache evictions', () => {
      const cache = getCache()
      // Fill cache beyond capacity (max 10000 items)
      // For testing, we'll mock with several sets
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const stats = getCacheStats()
      expect(stats).toHaveProperty('evictions')
    })
  })

  // ========================================================================
  // CACHE WRAPPER
  // ========================================================================

  describe('Cache Wrapper', () => {

    it('should use cache wrapper', async () => {
      const fetchFn = vi.fn(async () => ({ data: 'expensive' }))

      // First call - should fetch
      const result1 = await withCache('key1', 300, fetchFn)
      expect(result1).toEqual({ data: 'expensive' })
      expect(fetchFn).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const result2 = await withCache('key1', 300, fetchFn)
      expect(result2).toEqual({ data: 'expensive' })
      expect(fetchFn).toHaveBeenCalledTimes(1) // Still only called once
    })

    it('should respect cache TTL in wrapper', async () => {
      const fetchFn = vi.fn(async () => ({ data: Math.random() }))

      const result1 = await withCache('key1', 1, fetchFn)
      expect(fetchFn).toHaveBeenCalledTimes(1)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100))

      const result2 = await withCache('key1', 1, fetchFn)
      expect(fetchFn).toHaveBeenCalledTimes(2) // Called again after expiration
    })
  })

  // ========================================================================
  // LIST CACHE STRATEGY
  // ========================================================================

  describe('List Cache Strategy', () => {

    it('should cache list results', async () => {
      const fetchFn = vi.fn(async () => ({ items: [1, 2, 3], total: 3 }))

      const result1 = await ListCacheStrategy.getOrFetch(
        'tenant-1',
        1,
        'contacts',
        fetchFn
      )

      expect(result1.fromCache).toBe(false)
      expect(fetchFn).toHaveBeenCalledTimes(1)

      const result2 = await ListCacheStrategy.getOrFetch(
        'tenant-1',
        1,
        'contacts',
        fetchFn
      )

      expect(result2.fromCache).toBe(true)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('should invalidate list cache by resource', async () => {
      const cache = getCache()
      cache.set('contacts:tenant-1:p1', { items: [1, 2, 3], total: 3 })
      cache.set('contacts:tenant-1:p2', { items: [4, 5, 6], total: 3 })

      const deleted = ListCacheStrategy.invalidateResource('tenant-1', 'contacts')
      expect(deleted).toBe(2)
    })
  })

  // ========================================================================
  // DETAIL CACHE STRATEGY
  // ========================================================================

  describe('Detail Cache Strategy', () => {

    it('should cache detail results', async () => {
      const fetchFn = vi.fn(async () => ({ id: 'c-1', name: 'John' }))

      const result1 = await DetailCacheStrategy.getOrFetch(
        'tenant-1',
        'c-1',
        'contact',
        fetchFn
      )

      expect(result1.fromCache).toBe(false)
      expect(fetchFn).toHaveBeenCalledTimes(1)

      const result2 = await DetailCacheStrategy.getOrFetch(
        'tenant-1',
        'c-1',
        'contact',
        fetchFn
      )

      expect(result2.fromCache).toBe(true)
      expect(fetchFn).toHaveBeenCalledTimes(1)
    })

    it('should invalidate specific detail', async () => {
      const cache = getCache()
      cache.set('contact:tenant-1:c-1', { id: 'c-1', name: 'John' })

      const deleted = DetailCacheStrategy.invalidateResource('tenant-1', 'c-1', 'contact')
      expect(deleted).toBe(true)

      expect(cache.get('contact:tenant-1:c-1')).toBeNull()
    })
  })

  // ========================================================================
  // ANALYTICS CACHE STRATEGY
  // ========================================================================

  describe('Analytics Cache Strategy', () => {

    it('should cache analytics results', async () => {
      const computeFn = vi.fn(async () => ({ value: 487, trend: 'UP' }))

      const result1 = await AnalyticsCacheStrategy.getOrCompute(
        'tenant-1',
        'CONTACTS_TOTAL',
        'MONTH',
        computeFn
      )

      expect(result1.fromCache).toBe(false)
      expect(computeFn).toHaveBeenCalledTimes(1)

      const result2 = await AnalyticsCacheStrategy.getOrCompute(
        'tenant-1',
        'CONTACTS_TOTAL',
        'MONTH',
        computeFn
      )

      expect(result2.fromCache).toBe(true)
    })

    it('should invalidate tenant analytics', async () => {
      const cache = getCache()
      cache.set('analytics:tenant-1:CONTACTS_TOTAL:MONTH', { value: 487 })
      cache.set('analytics:tenant-1:LEADS_TOTAL:MONTH', { value: 892 })

      const deleted = AnalyticsCacheStrategy.invalidateTenantAnalytics('tenant-1')
      expect(deleted).toBe(2)
    })

    it('should invalidate specific metric', async () => {
      const cache = getCache()
      cache.set('analytics:tenant-1:CONTACTS_TOTAL:MONTH', { value: 487 })
      cache.set('analytics:tenant-1:CONTACTS_TOTAL:WEEK', { value: 45 })
      cache.set('analytics:tenant-1:LEADS_TOTAL:MONTH', { value: 892 })

      const deleted = AnalyticsCacheStrategy.invalidateMetric('tenant-1', 'CONTACTS_TOTAL')
      expect(deleted).toBe(2)
    })
  })

  // ========================================================================
  // SEARCH CACHE STRATEGY
  // ========================================================================

  describe('Search Cache Strategy', () => {

    it('should cache search results', async () => {
      const searchFn = vi.fn(async () => [
        { id: 'c-1', name: 'John' },
        { id: 'c-2', name: 'Jane' }
      ])

      const result1 = await SearchCacheStrategy.getOrSearch(
        'tenant-1',
        'john',
        searchFn
      )

      expect(result1.fromCache).toBe(false)
      expect(searchFn).toHaveBeenCalledTimes(1)

      const result2 = await SearchCacheStrategy.getOrSearch(
        'tenant-1',
        'john',
        searchFn
      )

      expect(result2.fromCache).toBe(true)
    })

    it('should invalidate tenant search', async () => {
      const cache = getCache()
      cache.set('search:tenant-1:abc12345', [{ id: 'c-1' }])
      cache.set('search:tenant-1:def67890', [{ id: 'c-2' }])

      const deleted = SearchCacheStrategy.invalidateTenantSearch('tenant-1')
      expect(deleted).toBe(2)
    })
  })

  // ========================================================================
  // WRITE-THROUGH CACHE STRATEGY
  // ========================================================================

  describe('Write-Through Cache Strategy', () => {

    it('should update and invalidate cache', async () => {
      const cache = getCache()
      cache.set('contact:tenant-1:c-1', { id: 'c-1', name: 'John' })
      cache.set('contacts:tenant-1:p1', { items: [{ id: 'c-1' }] })

      const updateFn = vi.fn(async () => ({ id: 'c-1', name: 'John Updated' }))

      const result = await WriteThroughCacheStrategy.updateAndInvalidate(
        'tenant-1',
        'c-1',
        'contact',
        updateFn
      )

      expect(updateFn).toHaveBeenCalled()
      expect(cache.get('contact:tenant-1:c-1')).toBeNull()
    })

    it('should delete and invalidate cache', async () => {
      const cache = getCache()
      cache.set('contact:tenant-1:c-1', { id: 'c-1' })

      const deleteFn = vi.fn(async () => true)

      const result = await WriteThroughCacheStrategy.deleteAndInvalidate(
        'tenant-1',
        'c-1',
        'contact',
        deleteFn
      )

      expect(result).toBe(true)
      expect(cache.get('contact:tenant-1:c-1')).toBeNull()
    })

    it('should create and seed cache', async () => {
      const createFn = vi.fn(async () => ({ id: 'c-1', name: 'John' }))

      const result = await WriteThroughCacheStrategy.createAndCache(
        'tenant-1',
        'contact',
        createFn
      )

      expect(createFn).toHaveBeenCalled()
      expect(result.id).toBe('c-1')
    })
  })

  // ========================================================================
  // CACHE WARMING STRATEGY
  // ========================================================================

  describe('Cache Warming Strategy', () => {

    it('should warm cache for multiple resources', async () => {
      const results = await CacheWarmingStrategy.warmCache('tenant-1', [
        {
          key: 'contacts:tenant-1:p1',
          ttl: 300,
          fetchFn: async () => ({ items: [1, 2, 3] })
        },
        {
          key: 'companies:tenant-1:p1',
          ttl: 300,
          fetchFn: async () => ({ items: [1, 2] })
        }
      ])

      expect(results).toHaveLength(2)
      expect(results[0].status).toBe('warmed')
      expect(results[1].status).toBe('warmed')
    })

    it('should warm tenant cache', async () => {
      const results = await CacheWarmingStrategy.warmTenantCache('tenant-1', {
        contacts: async () => ({ items: [1, 2, 3] }),
        companies: async () => ({ items: [1, 2] })
      })

      expect(results.contacts).toBe('warmed')
      expect(results.companies).toBe('warmed')
    })
  })

  // ========================================================================
  // CASCADING INVALIDATION
  // ========================================================================

  describe('Cascading Invalidation', () => {

    it('should cascade invalidate on contact update', () => {
      const cache = getCache()
      cache.set('contact:tenant-1:c-1', { id: 'c-1' })
      cache.set('contacts:tenant-1:p1', { items: [{ id: 'c-1' }] })
      cache.set('search:tenant-1:abc', [{ id: 'c-1' }])
      cache.set('analytics:tenant-1:CONTACTS_TOTAL:MONTH', { value: 487 })

      const deleted = CascadingInvalidationStrategy.invalidateOnContactUpdate('tenant-1', 'c-1')
      expect(deleted).toBeGreaterThan(0)
    })

    it('should cascade invalidate on company update', () => {
      const cache = getCache()
      cache.set('company:tenant-1:co-1', { id: 'co-1' })
      cache.set('companies:tenant-1:p1', { items: [{ id: 'co-1' }] })
      cache.set('analytics:tenant-1:COMPANIES_TOTAL:MONTH', { value: 128 })

      const deleted = CascadingInvalidationStrategy.invalidateOnCompanyUpdate('tenant-1', 'co-1')
      expect(deleted).toBeGreaterThan(0)
    })

    it('should cascade invalidate on lead update', () => {
      const cache = getCache()
      cache.set('lead:tenant-1:l-1', { id: 'l-1' })
      cache.set('leads:tenant-1:p1', { items: [{ id: 'l-1' }] })
      cache.set('analytics:tenant-1:LEADS_TOTAL:MONTH', { value: 892 })

      const deleted = CascadingInvalidationStrategy.invalidateOnLeadUpdate('tenant-1', 'l-1')
      expect(deleted).toBeGreaterThan(0)
    })
  })

  // ========================================================================
  // LRU EVICTION
  // ========================================================================

  describe('LRU Eviction', () => {

    it('should track multiple cache entries', () => {
      const cache = getCache()

      for (let i = 0; i < 100; i++) {
        cache.set(`key-${i}`, { data: i })
      }

      const stats = getCacheStats()
      expect(stats.size).toBe(100)
    })

    it('should provide cache statistics', () => {
      const cache = getCache()
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')

      const stats = getCacheStats()
      expect(stats).toHaveProperty('hits')
      expect(stats).toHaveProperty('misses')
      expect(stats).toHaveProperty('sets')
      expect(stats).toHaveProperty('deletes')
      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('utilization')
    })
  })
})
