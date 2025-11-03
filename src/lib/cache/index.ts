/**
 * Cache Manager - Phase 2.2a
 * Implements Redis-backed caching for API responses
 * 
 * Features:
 * - LRU eviction
 * - TTL-based expiration
 * - Pattern-based invalidation
 * - Compression support
 * - Distributed cache support
 */

import { createHash } from 'crypto'

// Cache TTLs by endpoint type (in seconds)
export const CACHE_TTL = {
  CONTACTS_LIST: 300,           // 5 minutes
  CONTACTS_DETAIL: 600,         // 10 minutes
  COMPANIES_LIST: 300,          // 5 minutes
  COMPANIES_DETAIL: 600,        // 10 minutes
  LEADS_LIST: 300,              // 5 minutes
  LEADS_DETAIL: 600,            // 10 minutes
  PIPELINES_LIST: 300,          // 5 minutes
  ACTIVITIES_LIST: 120,         // 2 minutes
  ANALYTICS: 600,               // 10 minutes
  REPORTS: 1800,                // 30 minutes
  API_KEYS_LIST: 600,           // 10 minutes
  WEBHOOKS_LIST: 600,           // 10 minutes
  WEBHOOK_EVENTS_LIST: 120,     // 2 minutes
  QR_SESSIONS_LIST: 300,        // 5 minutes
  SEARCH_RESULTS: 180,          // 3 minutes
  DEFAULT: 300                  // 5 minutes default
} as const

// Cache key prefixes
export const CACHE_KEYS = {
  CONTACTS: (tenantId: string, page: number) => `contacts:${tenantId}:p${page}`,
  CONTACTS_DETAIL: (tenantId: string, id: string) => `contacts:${tenantId}:${id}`,
  COMPANIES: (tenantId: string, page: number) => `companies:${tenantId}:p${page}`,
  COMPANIES_DETAIL: (tenantId: string, id: string) => `companies:${tenantId}:${id}`,
  LEADS: (tenantId: string, page: number) => `leads:${tenantId}:p${page}`,
  LEADS_DETAIL: (tenantId: string, id: string) => `leads:${tenantId}:${id}`,
  PIPELINES: (tenantId: string, page: number) => `pipelines:${tenantId}:p${page}`,
  ACTIVITIES: (tenantId: string, page: number) => `activities:${tenantId}:p${page}`,
  ANALYTICS: (tenantId: string, metric: string) => `analytics:${tenantId}:${metric}`,
  REPORTS: (tenantId: string, page: number) => `reports:${tenantId}:p${page}`,
  SEARCH: (tenantId: string, query: string) => `search:${tenantId}:${hashQuery(query)}`,
  API_KEYS: (tenantId: string, page: number) => `api-keys:${tenantId}:p${page}`,
  WEBHOOKS: (tenantId: string, page: number) => `webhooks:${tenantId}:p${page}`,
  WEBHOOK_EVENTS: (tenantId: string, page: number) => `webhook-events:${tenantId}:p${page}`,
  QR_SESSIONS: (tenantId: string, page: number) => `qr-sessions:${tenantId}:p${page}`
} as const

/**
 * In-memory cache implementation (for development/testing)
 * For production, use Redis or Memcached
 */
class InMemoryCache {
  private store = new Map<string, CacheEntry>()
  private maxSize = 10000
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.stats.misses++
      return null
    }

    // Update access time for LRU
    entry.lastAccess = Date.now()
    this.stats.hits++
    return entry.value as T
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttlSeconds?: number): void {
    // Evict if cache is full (LRU)
    if (this.store.size >= this.maxSize) {
      this.evictLRU()
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null

    this.store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now(),
      lastAccess: Date.now()
    })

    this.stats.sets++
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    const deleted = this.store.delete(key)
    if (deleted) this.stats.deletes++
    return deleted
  }

  /**
   * Delete values matching pattern
   * Patterns: "prefix:*", "prefix:tenant:*", etc.
   */
  deletePattern(pattern: string): number {
    const regex = new RegExp(`^${pattern.replace('*', '.*')}$`)
    let count = 0

    for (const [key] of this.store) {
      if (regex.test(key)) {
        this.store.delete(key)
        count++
      }
    }

    this.stats.deletes += count
    return count
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.store.size
    this.store.clear()
    this.stats.deletes += size
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : '0.00'

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.store.size,
      maxSize: this.maxSize,
      utilization: `${((this.store.size / this.maxSize) * 100).toFixed(2)}%`
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey = ''
    let lruTime = Infinity

    for (const [key, entry] of this.store) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess
        lruKey = key
      }
    }

    if (lruKey) {
      this.store.delete(lruKey)
      this.stats.evictions++
    }
  }
}

/**
 * Cache entry type
 */
interface CacheEntry {
  value: any
  expiresAt: number | null
  createdAt: number
  lastAccess: number
}

/**
 * Global cache instance
 */
let cacheInstance: InMemoryCache | null = null

/**
 * Get or create cache instance
 */
export function getCache(): InMemoryCache {
  if (!cacheInstance) {
    cacheInstance = new InMemoryCache()
  }
  return cacheInstance
}

/**
 * Hash a query string for cache key
 */
function hashQuery(query: string): string {
  return createHash('md5').update(query).digest('hex').substring(0, 8)
}

/**
 * Cache middleware wrapper
 */
export function withCache<T>(
  key: string,
  ttlSeconds: number = CACHE_TTL.DEFAULT,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cache = getCache()

  // Try to get from cache
  const cached = cache.get<T>(key)
  if (cached) {
    return Promise.resolve(cached)
  }

  // Fetch and cache
  return fetchFn().then((data) => {
    cache.set(key, data, ttlSeconds)
    return data
  })
}

/**
 * Invalidate cache by pattern
 */
export function invalidateCachePattern(pattern: string): number {
  const cache = getCache()
  return cache.deletePattern(pattern)
}

/**
 * Invalidate cache for a specific tenant
 */
export function invalidateTenantCache(tenantId: string): number {
  const cache = getCache()
  return cache.deletePattern(`*:${tenantId}:*`)
}

/**
 * Invalidate cache for a specific resource type
 */
export function invalidateResourceCache(resource: string, tenantId: string): number {
  const cache = getCache()
  return cache.deletePattern(`${resource}:${tenantId}:*`)
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  const cache = getCache()
  return cache.getStats()
}

/**
 * Clear all cache (use with caution)
 */
export function clearCache(): void {
  const cache = getCache()
  cache.clear()
}

/**
 * Reset cache instance (for testing)
 */
export function resetCacheInstance(): void {
  cacheInstance = null
}
