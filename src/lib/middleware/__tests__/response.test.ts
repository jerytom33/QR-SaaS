/**
 * Unit Tests: Response Middleware
 * Tests for standardized API response formatting
 *
 * Phase 1.3: Unit Testing Framework Setup
 * Date: November 3, 2025
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  successResponse,
  errorResponse,
  paginatedResponse,
  ApiResponse,
  PaginatedResponse,
} from '@/lib/middleware/response';

describe('Response Middleware', () => {
  describe('successResponse()', () => {
    it('should create success response with data', async () => {
      const data = { id: '123', name: 'Test' };

      const response = successResponse(data);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(data);
    });

    it('should include timestamp in response', async () => {
      const beforeTime = new Date();
      const response = successResponse({ test: true });
      const afterTime = new Date();

      const body = await response.json();

      expect(body.timestamp).toBeDefined();
      const responseTime = new Date(body.timestamp);
      expect(responseTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(responseTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should include message when provided', async () => {
      const response = successResponse({ test: true }, 'Operation successful');

      const body = await response.json();

      expect(body.message).toBe('Operation successful');
    });

    it('should omit message when not provided', async () => {
      const response = successResponse({ test: true });

      const body = await response.json();

      expect(body.message).toBeUndefined();
    });

    it('should support custom status code', async () => {
      const response = successResponse({ test: true }, 'Created', 201);

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.statusCode).toBe(201);
    });

    it('should handle null data', async () => {
      const response = successResponse(null);

      const body = await response.json();

      expect(body.data).toBeNull();
      expect(body.success).toBe(true);
    });

    it('should handle array data', async () => {
      const data = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const response = successResponse(data);

      const body = await response.json();

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
    });

    it('should handle complex nested data', async () => {
      const data = {
        user: {
          id: '123',
          profile: {
            name: 'Test User',
            emails: ['test@example.com'],
            settings: {
              notifications: true,
            },
          },
        },
      };
      const response = successResponse(data);

      const body = await response.json();

      expect(body.data.user.profile.settings.notifications).toBe(true);
    });

    it('should set statusCode field in response body', async () => {
      const response = successResponse({ test: true }, undefined, 202);

      const body = await response.json();

      expect(body.statusCode).toBe(202);
    });

    it('should default statusCode to 200', async () => {
      const response = successResponse({ test: true });

      const body = await response.json();

      expect(body.statusCode).toBe(200);
    });

    it('should always have success: true', async () => {
      const response = successResponse({ test: true });

      const body = await response.json();

      expect(body.success).toBe(true);
    });

    it('should handle empty object', async () => {
      const response = successResponse({});

      const body = await response.json();

      expect(body.data).toEqual({});
      expect(body.success).toBe(true);
    });
  });

  describe('errorResponse()', () => {
    it('should create error response', async () => {
      const response = errorResponse('ValidationError', 'Email is required');

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('ValidationError');
    });

    it('should include error message', async () => {
      const response = errorResponse('NotFound', 'User not found', 404);

      const body = await response.json();

      expect(body.message).toBe('User not found');
    });

    it('should support custom status code', async () => {
      const response = errorResponse('Unauthorized', 'Invalid token', 401);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.statusCode).toBe(401);
    });

    it('should include timestamp', async () => {
      const response = errorResponse('Error', 'Something went wrong');

      const body = await response.json();

      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp)).toBeInstanceOf(Date);
    });

    it('should not include data field', async () => {
      const response = errorResponse('Error', 'Something went wrong');

      const body = await response.json();

      expect(body.data).toBeUndefined();
    });

    it('should handle error without message', async () => {
      const response = errorResponse('InternalError');

      const body = await response.json();

      expect(body.error).toBe('InternalError');
      expect(body.message).toBeUndefined();
    });

    it('should default to 500 status code', async () => {
      const response = errorResponse('Error');

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.statusCode).toBe(500);
    });

    it('should handle common HTTP error codes', async () => {
      const testCases = [
        { code: 400, error: 'BadRequest' },
        { code: 401, error: 'Unauthorized' },
        { code: 403, error: 'Forbidden' },
        { code: 404, error: 'NotFound' },
        { code: 409, error: 'Conflict' },
        { code: 422, error: 'UnprocessableEntity' },
        { code: 429, error: 'TooManyRequests' },
        { code: 500, error: 'InternalError' },
        { code: 503, error: 'ServiceUnavailable' },
      ];

      for (const { code, error } of testCases) {
        const response = errorResponse(error, 'Test message', code);
        expect(response.status).toBe(code);
      }
    });

    it('should always have success: false', async () => {
      const response = errorResponse('Error');

      const body = await response.json();

      expect(body.success).toBe(false);
    });
  });

  describe('paginatedResponse()', () => {
    it('should create paginated response', async () => {
      const items = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
      ];
      const response = paginatedResponse(items, 100, 1, 10);

      const body = await response.json();

      expect(body.success).toBe(true);
      expect(body.data.items).toEqual(items);
      expect(body.data.total).toBe(100);
    });

    it('should calculate hasMore correctly', async () => {
      const items = Array(10)
        .fill(null)
        .map((_, i) => ({ id: `${i}` }));

      // Page 1 of 2
      const response1 = paginatedResponse(items, 15, 1, 10);
      const body1 = await response1.json();
      expect(body1.data.hasMore).toBe(true);

      // Page 2 of 2
      const response2 = paginatedResponse(items, 15, 2, 10);
      const body2 = await response2.json();
      expect(body2.data.hasMore).toBe(false);
    });

    it('should calculate hasMore when total equals items per page', async () => {
      const items = Array(10).fill(null).map((_, i) => ({ id: `${i}` }));

      const response = paginatedResponse(items, 10, 1, 10);
      const body = await response.json();

      expect(body.data.hasMore).toBe(false);
    });

    it('should include pagination metadata', async () => {
      const items = [{ id: '1' }];
      const response = paginatedResponse(items, 50, 3, 15);

      const body = await response.json();

      expect(body.data.page).toBe(3);
      expect(body.data.pageSize).toBe(15);
      expect(body.data.total).toBe(50);
    });

    it('should use default pagination values', async () => {
      const items = [{ id: '1' }];
      const response = paginatedResponse(items, 100);

      const body = await response.json();

      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(10);
    });

    it('should handle empty results', async () => {
      const response = paginatedResponse([], 0, 1, 10);

      const body = await response.json();

      expect(body.data.items).toHaveLength(0);
      expect(body.data.total).toBe(0);
      expect(body.data.hasMore).toBe(false);
    });

    it('should handle large page numbers', async () => {
      const items = [{ id: '1' }];
      const response = paginatedResponse(items, 1000, 100, 10);

      const body = await response.json();

      expect(body.data.page).toBe(100);
      // Page 100 with size 10 = items 991-1000, total is 1000, so no more pages
      expect(body.data.hasMore).toBe(false);
    });

    it('should return 200 status code', async () => {
      const response = paginatedResponse([], 0);

      expect(response.status).toBe(200);
    });

    it('should include timestamp', async () => {
      const response = paginatedResponse([], 0);

      const body = await response.json();

      expect(body.timestamp).toBeDefined();
    });

    it('should maintain data structure in pagination wrapper', async () => {
      const items = [
        { id: '1', nested: { value: 'test' } },
        { id: '2', nested: { value: 'test2' } },
      ];
      const response = paginatedResponse(items, 2);

      const body = await response.json();

      expect(body.data.items[0].nested.value).toBe('test');
      expect(body.data.items[1].nested.value).toBe('test2');
    });
  });

  describe('Response Headers', () => {
    it('should set Content-Type to application/json', async () => {
      const response = successResponse({ test: true });

      expect(response.headers.get('content-type')).toBe('application/json');
    });

    it('should return NextResponse instance', async () => {
      const response = successResponse({ test: true });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBeDefined();
      expect(response.headers).toBeDefined();
    });
  });

  describe('Response Consistency', () => {
    it('all responses should have timestamp in ISO format', async () => {
      const responses = [
        successResponse({ test: true }),
        errorResponse('Error'),
        paginatedResponse([], 0),
      ];

      for (const response of responses) {
        const body = await response.json();
        expect(body.timestamp).toBeDefined();

        // Should be valid ISO 8601 format
        expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });

    it('all responses should have statusCode field', async () => {
      const responses = [
        successResponse({ test: true }),
        errorResponse('Error'),
        paginatedResponse([], 0),
      ];

      for (const response of responses) {
        const body = await response.json();
        expect(body.statusCode).toBeDefined();
        expect(typeof body.statusCode).toBe('number');
      }
    });

    it('all responses should have success field', async () => {
      const successResp = successResponse({ test: true });
      const errorResp = errorResponse('Error');
      const paginatedResp = paginatedResponse([], 0);

      const successBody = await successResp.json();
      const errorBody = await errorResp.json();
      const paginatedBody = await paginatedResp.json();

      expect(successBody.success).toBe(true);
      expect(errorBody.success).toBe(false);
      expect(paginatedBody.success).toBe(true);
    });
  });

  describe('TypeScript Type Safety', () => {
    it('should handle typed success responses', async () => {
      interface User {
        id: string;
        name: string;
        email: string;
      }

      const user: User = {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
      };

      const response = successResponse<User>(user);
      const body = await response.json();

      expect(body.data.id).toBe('1');
      expect(body.data.name).toBe('Test User');
    });

    it('should handle typed paginated responses', async () => {
      interface Product {
        id: string;
        title: string;
        price: number;
      }

      const products: Product[] = [
        { id: '1', title: 'Product 1', price: 10 },
        { id: '2', title: 'Product 2', price: 20 },
      ];

      const response = paginatedResponse<Product>(products, 100, 1, 10);
      const body = await response.json();

      expect(body.data.items[0].price).toBe(10);
    });
  });
});
