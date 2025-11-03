/**
 * Advanced Pagination System
 * Supports: offset-limit, cursor-based, keyset-based pagination
 * Optimized for performance with infinite scroll
 */

import { z } from 'zod';

/**
 * Pagination metadata and options
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Pagination result with metadata
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total?: number;
    limit: number;
    offset?: number;
    cursor?: string;
    nextCursor?: string;
    previousCursor?: string;
    hasMore: boolean;
    pageCount?: number;
    currentPage?: number;
  };
}

/**
 * Cursor pagination metadata
 */
export interface CursorPaginationMeta {
  cursor: string;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  limit: number;
}

/**
 * Validation schemas
 */
export const PaginationQuerySchema = z.object({
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
  sortBy: z.string().optional().default('id'),
  sortOrder: z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

/**
 * Cursor encoding/decoding utilities
 */
export class CursorCodec {
  /**
   * Encode pagination cursor to base64 string
   */
  static encode(value: string | number | Date): string {
    let str = '';
    if (value instanceof Date) {
      str = value.toISOString();
    } else {
      str = String(value);
    }
    return Buffer.from(str).toString('base64');
  }

  /**
   * Decode base64 cursor to original value
   */
  static decode(cursor: string): string {
    try {
      return Buffer.from(cursor, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Create cursor from entity ID and timestamp
   */
  static createFromEntity(id: string | number, timestamp?: Date): string {
    const value = timestamp
      ? `${id}:${timestamp.toISOString()}`
      : `${id}`;
    return this.encode(value);
  }

  /**
   * Parse cursor to extract ID and timestamp
   */
  static parseEntity(cursor: string): { id: string; timestamp?: Date } | null {
    const decoded = this.decode(cursor);
    const parts = decoded.split(':');
    
    if (parts.length === 1) {
      return { id: parts[0] };
    }
    if (parts.length === 2) {
      try {
        return {
          id: parts[0],
          timestamp: new Date(parts[1]),
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Offset-based pagination builder
 */
export class OffsetPaginator {
  constructor(
    private defaultLimit: number = 20,
    private maxLimit: number = 100
  ) {}

  /**
   * Get offset from page number (1-indexed)
   */
  getOffset(page: number, limit: number = this.defaultLimit): number {
    const validLimit = Math.min(Math.max(limit, 1), this.maxLimit);
    return (Math.max(page, 1) - 1) * validLimit;
  }

  /**
   * Get page number from offset
   */
  getPage(offset: number, limit: number = this.defaultLimit): number {
    const validLimit = Math.min(Math.max(limit, 1), this.maxLimit);
    return Math.floor(offset / validLimit) + 1;
  }

  /**
   * Build offset-limit query
   */
  buildQuery(options: PaginationOptions): { offset: number; limit: number } {
    const limit = Math.min(options.limit || this.defaultLimit, this.maxLimit);
    const offset = options.offset || 0;
    return { offset, limit };
  }

  /**
   * Build paginated result
   */
  buildResult<T>(
    data: T[],
    total: number,
    options: PaginationOptions
  ): PaginatedResult<T> {
    const limit = Math.min(options.limit || this.defaultLimit, this.maxLimit);
    const offset = options.offset || 0;
    const pageCount = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      data,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + data.length < total,
        pageCount,
        currentPage,
      },
    };
  }
}

/**
 * Cursor-based pagination builder
 * More efficient than offset-limit for large datasets
 */
export class CursorPaginator {
  constructor(
    private defaultLimit: number = 20,
    private maxLimit: number = 100
  ) {}

  /**
   * Validate and normalize cursor
   */
  validateCursor(cursor?: string): string | null {
    if (!cursor) return null;
    const decoded = CursorCodec.decode(cursor);
    return decoded.length > 0 ? cursor : null;
  }

  /**
   * Build cursor query (returns one extra to detect hasMore)
   */
  buildQuery(options: PaginationOptions): {
    limit: number;
    cursor?: string;
    offset?: string;
  } {
    const limit = Math.min(Math.max(options.limit || this.defaultLimit, 1), this.maxLimit);
    const cursor = this.validateCursor(options.cursor);

    return {
      limit: limit + 1, // +1 to detect hasMore
      ...(cursor && { cursor }),
    };
  }

  /**
   * Build paginated result with cursor
   */
  buildResult<T>(
    data: T[],
    options: PaginationOptions,
    getEntityCursor: (item: T) => string
  ): PaginatedResult<T> {
    const limit = Math.min(options.limit || this.defaultLimit, this.maxLimit);
    const hasMore = data.length > limit;
    
    // Remove the extra item used for hasMore detection
    const results = hasMore ? data.slice(0, limit) : data;

    const nextCursor = hasMore && results.length > 0
      ? getEntityCursor(results[results.length - 1])
      : undefined;

    const previousCursor = options.cursor || undefined;

    return {
      data: results,
      pagination: {
        limit,
        cursor: options.cursor,
        nextCursor,
        previousCursor,
        hasMore,
      },
    };
  }

  /**
   * Build WHERE clause for cursor query
   */
  buildWhereClause(
    cursor: string | null,
    sortField: string,
    sortOrder: 'ASC' | 'DESC'
  ): string {
    if (!cursor) return '';

    const decodedCursor = CursorCodec.decode(cursor);
    const operator = sortOrder === 'ASC' ? '>' : '<';
    
    return `${sortField} ${operator} '${decodedCursor}'`;
  }
}

/**
 * Keyset pagination builder
 * Most efficient for very large datasets, uses multiple sort keys
 */
export class KeysetPaginator {
  constructor(
    private defaultLimit: number = 20,
    private maxLimit: number = 100,
    private primaryKey: string = 'id'
  ) {}

  /**
   * Build keyset query
   */
  buildQuery(options: PaginationOptions & { keys?: Record<string, unknown> }): {
    limit: number;
    keys?: Record<string, unknown>;
  } {
    const limit = Math.min(Math.max(options.limit || this.defaultLimit, 1), this.maxLimit);
    
    return {
      limit: limit + 1, // +1 for hasMore detection
      keys: options.keys,
    };
  }

  /**
   * Build keyset WHERE clause for efficient filtering
   */
  buildWhereClause(
    keys: Record<string, unknown> | null,
    sortFields: string[],
    sortOrder: 'ASC' | 'DESC'
  ): string {
    if (!keys || Object.keys(keys).length === 0) return '';

    const operator = sortOrder === 'ASC' ? '>' : '<';
    const conditions = sortFields.map(field => {
      const value = keys[field];
      if (value === null || value === undefined) return '';
      
      const escapedValue = typeof value === 'string'
        ? `'${value.replace(/'/g, "''")}'`
        : value;
      
      return `${field} ${operator} ${escapedValue}`;
    });

    return conditions.filter(c => c.length > 0).join(' AND ');
  }

  /**
   * Extract keys from result for next page
   */
  extractKeys<T>(item: T, fields: string[]): Record<string, unknown> {
    const keys: Record<string, unknown> = {};
    for (const field of fields) {
      keys[field] = (item as any)[field];
    }
    return keys;
  }

  /**
   * Build paginated result
   */
  buildResult<T>(
    data: T[],
    options: PaginationOptions & { sortFields?: string[] },
    extractKeys: (item: T) => Record<string, unknown>
  ): PaginatedResult<T> {
    const limit = Math.min(options.limit || this.defaultLimit, this.maxLimit);
    const hasMore = data.length > limit;
    
    const results = hasMore ? data.slice(0, limit) : data;
    const nextKeys = results.length > 0 ? extractKeys(results[results.length - 1]) : undefined;

    return {
      data: results,
      pagination: {
        limit,
        hasMore,
        nextCursor: nextKeys ? CursorCodec.encode(JSON.stringify(nextKeys)) : undefined,
      },
    };
  }
}

/**
 * Infinite scroll helper
 * Manages loading state and cursor progression
 */
export class InfiniteScrollManager {
  private items: any[] = [];
  private currentCursor: string | null = null;
  private hasMore: boolean = true;
  private isLoading: boolean = false;

  constructor(
    private paginator: CursorPaginator,
    private limit: number = 20
  ) {}

  /**
   * Load initial page
   */
  async loadInitial<T>(
    loadFn: (options: PaginationOptions) => Promise<PaginatedResult<T>>
  ): Promise<T[]> {
    this.isLoading = true;
    try {
      const result = await loadFn({ limit: this.limit });
      this.items = result.data;
      this.currentCursor = result.pagination.nextCursor || null;
      this.hasMore = result.pagination.hasMore;
      return result.data;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load next page
   */
  async loadMore<T>(
    loadFn: (options: PaginationOptions) => Promise<PaginatedResult<T>>
  ): Promise<T[]> {
    if (!this.hasMore || this.isLoading) return [];

    this.isLoading = true;
    try {
      const result = await loadFn({
        limit: this.limit,
        cursor: this.currentCursor || undefined,
      });
      
      this.items.push(...result.data);
      this.currentCursor = result.pagination.nextCursor || null;
      this.hasMore = result.pagination.hasMore;
      
      return result.data;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get all loaded items
   */
  getItems(): any[] {
    return [...this.items];
  }

  /**
   * Check if more data available
   */
  canLoadMore(): boolean {
    return this.hasMore && !this.isLoading;
  }

  /**
   * Get loading state
   */
  getIsLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.items = [];
    this.currentCursor = null;
    this.hasMore = true;
    this.isLoading = false;
  }

  /**
   * Get current page info
   */
  getPageInfo() {
    return {
      itemCount: this.items.length,
      currentCursor: this.currentCursor,
      hasMore: this.hasMore,
      isLoading: this.isLoading,
    };
  }
}

/**
 * Window function helper for efficient pagination with ranking
 * Useful for: top N results per group, pagination with row numbering
 */
export class WindowFunctionBuilder {
  /**
   * Build ROW_NUMBER() window function for pagination
   */
  static buildRowNumber(
    field: string,
    partitionBy?: string,
    orderBy?: string
  ): string {
    let sql = `ROW_NUMBER() OVER (`;
    
    if (partitionBy) {
      sql += `PARTITION BY ${partitionBy} `;
    }
    
    sql += `ORDER BY ${orderBy || field}`;
    sql += `) as row_num`;
    
    return sql;
  }

  /**
   * Build RANK() window function (handles ties)
   */
  static buildRank(orderBy: string, partitionBy?: string): string {
    let sql = `RANK() OVER (`;
    
    if (partitionBy) {
      sql += `PARTITION BY ${partitionBy} `;
    }
    
    sql += `ORDER BY ${orderBy}`;
    sql += `) as rank`;
    
    return sql;
  }

  /**
   * Build DENSE_RANK() window function (no gaps with ties)
   */
  static buildDenseRank(orderBy: string, partitionBy?: string): string {
    let sql = `DENSE_RANK() OVER (`;
    
    if (partitionBy) {
      sql += `PARTITION BY ${partitionBy} `;
    }
    
    sql += `ORDER BY ${orderBy}`;
    sql += `) as dense_rank`;
    
    return sql;
  }

  /**
   * Build LAG/LEAD for comparing with previous/next rows
   */
  static buildLag(field: string, offset: number = 1, default_val?: string): string {
    return `LAG(${field}, ${offset}${default_val ? `, ${default_val}` : ''}) OVER (ORDER BY ${field}) as prev_${field}`;
  }

  static buildLead(field: string, offset: number = 1, default_val?: string): string {
    return `LEAD(${field}, ${offset}${default_val ? `, ${default_val}` : ''}) OVER (ORDER BY ${field}) as next_${field}`;
  }

  /**
   * Build aggregate window function (e.g., SUM over window)
   */
  static buildAggregate(
    func: 'SUM' | 'AVG' | 'COUNT' | 'MAX' | 'MIN',
    field: string,
    partitionBy: string,
    orderBy?: string
  ): string {
    let sql = `${func}(${field}) OVER (`;
    sql += `PARTITION BY ${partitionBy}`;
    
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    
    sql += `) as ${func.toLowerCase()}_${field}`;
    return sql;
  }
}

/**
 * Pagination caching helper
 * Integrate with Phase 2.2a cache system
 */
export class PaginationCacheKey {
  /**
   * Generate cache key for paginated result
   */
  static generate(
    entity: string,
    filter: Record<string, unknown>,
    options: PaginationOptions
  ): string {
    const filterStr = JSON.stringify(filter);
    const optionsStr = JSON.stringify(options);
    return `${entity}:pagination:${filterStr}:${optionsStr}`;
  }

  /**
   * Generate cache key for cursor position
   */
  static forCursor(
    entity: string,
    cursor: string,
    limit: number
  ): string {
    return `${entity}:cursor:${CursorCodec.decode(cursor)}:${limit}`;
  }

  /**
   * Build pattern for wildcard cache invalidation
   */
  static getInvalidationPattern(entity: string): string {
    return `${entity}:pagination:*`;
  }
}

/**
 * Parse pagination query string
 */
export function parsePaginationQuery(
  searchParams: URLSearchParams
): PaginationOptions {
  return {
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 20,
    offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0,
    cursor: searchParams.get('cursor') || undefined,
    sortBy: searchParams.get('sortBy') || 'id',
    sortOrder: (searchParams.get('sortOrder') as 'ASC' | 'DESC') || 'DESC',
  };
}

/**
 * Combine pagination options with defaults
 */
export function withDefaults(
  options: Partial<PaginationOptions>
): PaginationOptions {
  return {
    limit: options.limit || 20,
    offset: options.offset !== undefined ? options.offset : 0,
    cursor: options.cursor,
    sortBy: options.sortBy || 'id',
    sortOrder: options.sortOrder || 'DESC',
  };
}

/**
 * Determine optimal pagination method for dataset size
 */
export function recommendPaginationMethod(estimatedCount: number): 'offset' | 'cursor' | 'keyset' {
  if (estimatedCount < 10000) return 'offset'; // Small dataset
  if (estimatedCount < 1000000) return 'cursor'; // Medium dataset
  return 'keyset'; // Large dataset
}
