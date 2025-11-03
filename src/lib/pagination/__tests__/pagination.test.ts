/**
 * Pagination System Tests
 * Coverage: offset, cursor, keyset pagination, infinite scroll, window functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OffsetPaginator,
  CursorPaginator,
  KeysetPaginator,
  CursorCodec,
  InfiniteScrollManager,
  WindowFunctionBuilder,
  PaginationCacheKey,
  parsePaginationQuery,
  withDefaults,
  recommendPaginationMethod,
} from '../pagination';

describe('CursorCodec', () => {
  it('should encode string to base64 cursor', () => {
    const cursor = CursorCodec.encode('test-id-123');
    expect(cursor).toBeDefined();
    expect(typeof cursor).toBe('string');
  });

  it('should decode base64 cursor to original value', () => {
    const original = 'test-id-123';
    const cursor = CursorCodec.encode(original);
    const decoded = CursorCodec.decode(cursor);
    expect(decoded).toBe(original);
  });

  it('should encode numeric values', () => {
    const cursor = CursorCodec.encode(12345);
    const decoded = CursorCodec.decode(cursor);
    expect(decoded).toBe('12345');
  });

  it('should encode date values to ISO string', () => {
    const date = new Date('2025-01-01T12:00:00Z');
    const cursor = CursorCodec.encode(date);
    const decoded = CursorCodec.decode(cursor);
    expect(decoded).toContain('2025-01-01');
  });

  it('should handle invalid base64 gracefully', () => {
    const decoded = CursorCodec.decode('!!!invalid!!!');
    expect(typeof decoded).toBe('string');
  });

  it('should create cursor from entity ID and timestamp', () => {
    const cursor = CursorCodec.createFromEntity('contact-123', new Date('2025-01-01'));
    const parsed = CursorCodec.parseEntity(cursor);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('contact-123');
  });

  it('should parse cursor back to entity ID', () => {
    const cursor = CursorCodec.createFromEntity('contact-123');
    const parsed = CursorCodec.parseEntity(cursor);
    expect(parsed?.id).toBe('contact-123');
  });
});

describe('OffsetPaginator', () => {
  let paginator: OffsetPaginator;

  beforeEach(() => {
    paginator = new OffsetPaginator(20, 100);
  });

  it('should calculate offset from page number', () => {
    const offset = paginator.getOffset(1, 20);
    expect(offset).toBe(0);

    const offset2 = paginator.getOffset(2, 20);
    expect(offset2).toBe(20);

    const offset3 = paginator.getOffset(5, 20);
    expect(offset3).toBe(80);
  });

  it('should calculate page number from offset', () => {
    expect(paginator.getPage(0, 20)).toBe(1);
    expect(paginator.getPage(20, 20)).toBe(2);
    expect(paginator.getPage(80, 20)).toBe(5);
  });

  it('should enforce max limit', () => {
    const query = paginator.buildQuery({ limit: 500, offset: 0 });
    expect(query.limit).toBe(100);
  });

  it('should build paginated result with metadata', () => {
    const data = Array(20).fill(null).map((_, i) => ({ id: i + 1 }));
    const result = paginator.buildResult(data, 100, { limit: 20, offset: 0 });

    expect(result.data).toHaveLength(20);
    expect(result.pagination.total).toBe(100);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.pageCount).toBe(5);
    expect(result.pagination.currentPage).toBe(1);
  });

  it('should detect last page', () => {
    const data = Array(10).fill(null).map((_, i) => ({ id: i + 1 }));
    const result = paginator.buildResult(data, 50, { limit: 20, offset: 40 });

    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.currentPage).toBe(3);
  });
});

describe('CursorPaginator', () => {
  let paginator: CursorPaginator;

  beforeEach(() => {
    paginator = new CursorPaginator(20, 100);
  });

  it('should validate cursor', () => {
    const validCursor = CursorCodec.encode('test');
    expect(paginator.validateCursor(validCursor)).toBe(validCursor);
    expect(paginator.validateCursor()).toBeNull();
    expect(paginator.validateCursor('invalid!')).toBeNull();
  });

  it('should build cursor query with extra item for hasMore detection', () => {
    const query = paginator.buildQuery({ limit: 20 });
    expect(query.limit).toBe(21); // +1 for hasMore detection
  });

  it('should build paginated result with cursors', () => {
    const data = Array(21).fill(null).map((_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
    
    const result = paginator.buildResult(data, { limit: 20 }, (item) => 
      CursorCodec.encode(String(item.id))
    );

    expect(result.data).toHaveLength(20);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.nextCursor).toBeDefined();
  });

  it('should indicate no more data when results <= limit', () => {
    const data = Array(15).fill(null).map((_, i) => ({ id: i + 1 }));
    
    const result = paginator.buildResult(data, { limit: 20 }, (item) => 
      CursorCodec.encode(String(item.id))
    );

    expect(result.data).toHaveLength(15);
    expect(result.pagination.hasMore).toBe(false);
  });

  it('should build WHERE clause for cursor query', () => {
    const cursor = CursorCodec.encode('100');
    const where = paginator.buildWhereClause(cursor, 'id', 'DESC');
    
    expect(where).toContain('id');
    expect(where).toContain('<');
  });

  it('should use ASC operator when sortOrder is ASC', () => {
    const cursor = CursorCodec.encode('100');
    const where = paginator.buildWhereClause(cursor, 'id', 'ASC');
    
    expect(where).toContain('>');
  });
});

describe('KeysetPaginator', () => {
  let paginator: KeysetPaginator;

  beforeEach(() => {
    paginator = new KeysetPaginator(20, 100, 'id');
  });

  it('should build keyset query', () => {
    const query = paginator.buildQuery({
      limit: 20,
      keys: { id: '100', created_at: '2025-01-01' },
    });

    expect(query.limit).toBe(21);
    expect(query.keys).toBeDefined();
  });

  it('should build WHERE clause from keyset keys', () => {
    const keys = { id: '100', created_at: '2025-01-01' };
    const where = paginator.buildWhereClause(keys, ['id', 'created_at'], 'DESC');

    expect(where).toContain('id');
    expect(where).toContain('created_at');
    expect(where).toContain('AND');
  });

  it('should escape string values in WHERE clause', () => {
    const keys = { name: "O'Reilly" };
    const where = paginator.buildWhereClause(keys, ['name'], 'ASC');

    expect(where).toContain("O''Reilly");
  });

  it('should extract keys from result item', () => {
    const item = { id: '123', created_at: new Date(), name: 'Test' };
    const keys = paginator.extractKeys(item, ['id', 'created_at']);

    expect(keys.id).toBe('123');
    expect(keys.created_at).toBeDefined();
  });

  it('should build paginated result with keyset', () => {
    const data = Array(21).fill(null).map((_, i) => ({ id: String(i + 1), value: i + 1 }));
    
    const result = paginator.buildResult(data, { limit: 20 }, (item) => ({
      id: item.id,
    }));

    expect(result.data).toHaveLength(20);
    expect(result.pagination.hasMore).toBe(true);
  });
});

describe('InfiniteScrollManager', () => {
  let manager: InfiniteScrollManager;
  let paginator: CursorPaginator;

  beforeEach(() => {
    paginator = new CursorPaginator(20, 100);
    manager = new InfiniteScrollManager(paginator, 20);
  });

  it('should load initial page', async () => {
    const mockLoad = async () => ({
      data: Array(20).fill(null).map((_, i) => ({ id: i + 1 })),
      pagination: {
        limit: 20,
        hasMore: true,
        nextCursor: CursorCodec.encode('cursor'),
      },
    });

    const items = await manager.loadInitial(mockLoad);

    expect(items).toHaveLength(20);
    expect(manager.getItems()).toHaveLength(20);
    expect(manager.canLoadMore()).toBe(true);
  });

  it('should load more pages', async () => {
    const mockLoad = async (options: any) => {
      const isInitial = !options.cursor;
      const data = Array(isInitial ? 20 : 15).fill(null).map((_, i) => ({ id: i + (isInitial ? 1 : 21) }));
      return {
        data,
        pagination: {
          limit: 20,
          hasMore: isInitial,
          nextCursor: isInitial ? CursorCodec.encode('cursor2') : undefined,
        },
      };
    };

    await manager.loadInitial(mockLoad);
    const moreItems = await manager.loadMore(mockLoad);

    expect(moreItems).toHaveLength(15);
    expect(manager.getItems()).toHaveLength(35);
  });

  it('should prevent loading while already loading', async () => {
    const mockLoad = async () => ({
      data: Array(20).fill(null).map((_, i) => ({ id: i + 1 })),
      pagination: { limit: 20, hasMore: false },
    });

    manager.loadInitial(mockLoad);
    manager.loadMore(mockLoad);

    expect(manager.getIsLoading()).toBe(true);
  });

  it('should prevent loading when no more data', async () => {
    const mockLoad = async () => ({
      data: Array(10).fill(null).map((_, i) => ({ id: i + 1 })),
      pagination: { limit: 20, hasMore: false },
    });

    await manager.loadInitial(mockLoad);
    const canLoad = manager.canLoadMore();

    expect(canLoad).toBe(false);
  });

  it('should reset state', async () => {
    const mockLoad = async () => ({
      data: Array(20).fill(null).map((_, i) => ({ id: i + 1 })),
      pagination: { limit: 20, hasMore: true },
    });

    await manager.loadInitial(mockLoad);
    manager.reset();

    expect(manager.getItems()).toHaveLength(0);
    expect(manager.canLoadMore()).toBe(true);
    expect(manager.getIsLoading()).toBe(false);
  });

  it('should provide page info', async () => {
    const mockLoad = async () => ({
      data: Array(20).fill(null).map((_, i) => ({ id: i + 1 })),
      pagination: { limit: 20, hasMore: true, nextCursor: 'cursor' },
    });

    await manager.loadInitial(mockLoad);
    const info = manager.getPageInfo();

    expect(info.itemCount).toBe(20);
    expect(info.hasMore).toBe(true);
    expect(info.isLoading).toBe(false);
  });
});

describe('WindowFunctionBuilder', () => {
  it('should build ROW_NUMBER window function', () => {
    const sql = WindowFunctionBuilder.buildRowNumber('id', 'status', 'created_at DESC');
    expect(sql).toContain('ROW_NUMBER()');
    expect(sql).toContain('PARTITION BY');
    expect(sql).toContain('ORDER BY');
  });

  it('should build RANK window function', () => {
    const sql = WindowFunctionBuilder.buildRank('score DESC', 'user_id');
    expect(sql).toContain('RANK()');
    expect(sql).toContain('PARTITION BY');
  });

  it('should build DENSE_RANK window function', () => {
    const sql = WindowFunctionBuilder.buildDenseRank('amount DESC');
    expect(sql).toContain('DENSE_RANK()');
  });

  it('should build LAG window function', () => {
    const sql = WindowFunctionBuilder.buildLag('price', 1, "0");
    expect(sql).toContain('LAG');
    expect(sql).toContain('prev_price');
  });

  it('should build LEAD window function', () => {
    const sql = WindowFunctionBuilder.buildLead('price', 1);
    expect(sql).toContain('LEAD');
    expect(sql).toContain('next_price');
  });

  it('should build aggregate window function', () => {
    const sql = WindowFunctionBuilder.buildAggregate('SUM', 'amount', 'user_id', 'created_at DESC');
    expect(sql).toContain('SUM');
    expect(sql).toContain('PARTITION BY');
    expect(sql).toContain('sum_amount');
  });

  it('should build COUNT aggregate', () => {
    const sql = WindowFunctionBuilder.buildAggregate('COUNT', 'id', 'status');
    expect(sql).toContain('COUNT(id)');
    expect(sql).toContain('count_id');
  });
});

describe('PaginationCacheKey', () => {
  it('should generate cache key for paginated result', () => {
    const key = PaginationCacheKey.generate('contacts', { status: 'active' }, { limit: 20, offset: 0 });
    
    expect(key).toContain('contacts');
    expect(key).toContain('pagination');
  });

  it('should generate cache key for cursor position', () => {
    const cursor = CursorCodec.encode('position-100');
    const key = PaginationCacheKey.forCursor('leads', cursor, 20);
    
    expect(key).toContain('leads');
    expect(key).toContain('cursor');
  });

  it('should generate invalidation pattern', () => {
    const pattern = PaginationCacheKey.getInvalidationPattern('contacts');
    
    expect(pattern).toContain('contacts:pagination');
    expect(pattern).toContain('*');
  });
});

describe('Helper Functions', () => {
  it('should parse pagination query string', () => {
    const params = new URLSearchParams('limit=50&offset=100&sortBy=name&sortOrder=ASC');
    const options = parsePaginationQuery(params);

    expect(options.limit).toBe(50);
    expect(options.offset).toBe(100);
    expect(options.sortBy).toBe('name');
    expect(options.sortOrder).toBe('ASC');
  });

  it('should use defaults for missing query params', () => {
    const params = new URLSearchParams('');
    const options = parsePaginationQuery(params);

    expect(options.limit).toBe(20);
    expect(options.offset).toBe(0);
    expect(options.sortBy).toBe('id');
    expect(options.sortOrder).toBe('DESC');
  });

  it('should fill in pagination defaults', () => {
    const options = withDefaults({ limit: 50 });

    expect(options.limit).toBe(50);
    expect(options.offset).toBe(0);
    expect(options.sortBy).toBe('id');
    expect(options.sortOrder).toBe('DESC');
  });

  it('should recommend offset pagination for small datasets', () => {
    const method = recommendPaginationMethod(5000);
    expect(method).toBe('offset');
  });

  it('should recommend cursor pagination for medium datasets', () => {
    const method = recommendPaginationMethod(50000);
    expect(method).toBe('cursor');
  });

  it('should recommend keyset pagination for large datasets', () => {
    const method = recommendPaginationMethod(2000000);
    expect(method).toBe('keyset');
  });
});

describe('Integration Tests', () => {
  it('should handle complete cursor pagination workflow', async () => {
    const paginator = new CursorPaginator(20, 100);
    const mockData = Array(50).fill(null).map((_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

    // First page
    let pageData = mockData.slice(0, 21);
    let result = paginator.buildResult(pageData, { limit: 20 }, (item) => 
      CursorCodec.encode(String(item.id))
    );

    expect(result.pagination.hasMore).toBe(true);

    // Second page
    const cursor = result.pagination.nextCursor;
    pageData = mockData.slice(20, 41);
    result = paginator.buildResult(pageData, { limit: 20, cursor }, (item) => 
      CursorCodec.encode(String(item.id))
    );

    expect(result.data).toHaveLength(20);
  });

  it('should handle complete keyset pagination workflow', () => {
    const paginator = new KeysetPaginator(20, 100);

    const firstQuery = paginator.buildQuery({ limit: 20 });
    expect(firstQuery.limit).toBe(21);

    const keys = { id: '20', created_at: '2025-01-01' };
    const secondQuery = paginator.buildQuery({ limit: 20, keys });
    expect(secondQuery.keys).toEqual(keys);
  });

  it('should transition between pagination methods', () => {
    const smallSet = recommendPaginationMethod(5000);
    const mediumSet = recommendPaginationMethod(500000);
    const largeSet = recommendPaginationMethod(10000000);

    expect(smallSet).toBe('offset');
    expect(mediumSet).toBe('cursor');
    expect(largeSet).toBe('keyset');
  });

  it('should work with infinite scroll for long lists', async () => {
    const paginator = new CursorPaginator(20, 100);
    const manager = new InfiniteScrollManager(paginator, 20);

    let currentPage = 1;
    const mockLoad = async (options: any) => {
      const startId = ((options.offset || 0) * 20) + 1;
      const data = Array(20).fill(null).map((_, i) => ({ id: startId + i }));
      const hasMore = currentPage < 5;
      currentPage++;

      return {
        data,
        pagination: {
          limit: 20,
          hasMore,
          nextCursor: hasMore ? CursorCodec.encode(`cursor-${currentPage}`) : undefined,
        },
      };
    };

    await manager.loadInitial(mockLoad);
    expect(manager.getItems()).toHaveLength(20);

    await manager.loadMore(mockLoad);
    expect(manager.getItems().length).toBeGreaterThan(20);
  });
});

describe('Performance Characteristics', () => {
  it('should decode cursors quickly', () => {
    const cursor = CursorCodec.encode('test-id-123');
    
    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      CursorCodec.decode(cursor);
    }
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(100); // 1000 decodes < 100ms
  });

  it('should build queries efficiently', () => {
    const paginator = new CursorPaginator();

    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      paginator.buildQuery({ limit: 20, offset: i * 20 });
    }
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(50);
  });
});
