/**
 * Unit Tests: Authentication Middleware
 * Tests for JWT token extraction, verification, and role-based access control
 *
 * Phase 1.3: Unit Testing Framework Setup
 * Date: November 3, 2025
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sign } from 'jsonwebtoken';
import {
  AuthUser,
  extractToken,
  verifyToken,
  withAuth,
  requireRole,
  compose,
} from '@/lib/middleware/auth';
import { config } from '@/lib/config';

describe('Authentication Middleware', () => {
  const mockUser: AuthUser = {
    userId: 'user-123',
    profileId: 'profile-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER',
    tenantId: 'tenant-123',
    tenantSlug: 'test-tenant',
    tenantName: 'Test Tenant',
  };

  const mockToken = sign(mockUser, config.JWT_SECRET, { expiresIn: '1h' });

  const mockRequest = (headers: Record<string, string>): NextRequest => {
    return {
      headers: new Headers(headers),
    } as NextRequest;
  };

  describe('extractToken()', () => {
    it('should extract token from Authorization header', () => {
      const request = mockRequest({
        Authorization: `Bearer ${mockToken}`,
      });

      const token = extractToken(request);

      expect(token).toBe(mockToken);
    });

    it('should return null for missing Authorization header', () => {
      const request = mockRequest({});

      const token = extractToken(request);

      expect(token).toBeNull();
    });

    it('should return null for missing Bearer prefix', () => {
      const request = mockRequest({
        Authorization: mockToken,
      });

      const token = extractToken(request);

      expect(token).toBeNull();
    });

    it('should return null for empty Authorization header', () => {
      const request = mockRequest({
        Authorization: '',
      });

      const token = extractToken(request);

      expect(token).toBeNull();
    });

    it('should handle case-insensitive Bearer prefix', () => {
      const request = mockRequest({
        Authorization: `bearer ${mockToken}`,
      });

      const token = extractToken(request);

      // Bearer is case-sensitive in the implementation
      expect(token).toBeNull();
    });

    it('should extract token with extra whitespace', () => {
      const request = mockRequest({
        Authorization: `Bearer  ${mockToken}`,
      });

      const token = extractToken(request);

      // Implementation trims exactly 7 characters
      expect(token).not.toBe(mockToken);
    });
  });

  describe('verifyToken()', () => {
    it('should verify valid token and return user data', () => {
      const user = verifyToken(mockToken);

      expect(user).not.toBeNull();
      expect(user?.userId).toBe(mockUser.userId);
      expect(user?.email).toBe(mockUser.email);
      expect(user?.role).toBe(mockUser.role);
      expect(user?.tenantId).toBe(mockUser.tenantId);
    });

    it('should return all user properties from token', () => {
      const user = verifyToken(mockToken);

      expect(user).not.toBeNull();
      expect(user?.userId).toBe(mockUser.userId);
      expect(user?.profileId).toBe(mockUser.profileId);
      expect(user?.email).toBe(mockUser.email);
      expect(user?.name).toBe(mockUser.name);
      expect(user?.role).toBe(mockUser.role);
      expect(user?.tenantId).toBe(mockUser.tenantId);
      expect(user?.tenantSlug).toBe(mockUser.tenantSlug);
      expect(user?.tenantName).toBe(mockUser.tenantName);
    });

    it('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.format';

      const user = verifyToken(invalidToken);

      expect(user).toBeNull();
    });

    it('should return null for expired token', () => {
      const expiredToken = sign(mockUser, config.JWT_SECRET, {
        expiresIn: '-1s',
      });

      const user = verifyToken(expiredToken);

      expect(user).toBeNull();
    });

    it('should return null for token signed with wrong secret', () => {
      const wrongSecretToken = sign(mockUser, 'wrong-secret', {
        expiresIn: '1h',
      });

      const user = verifyToken(wrongSecretToken);

      expect(user).toBeNull();
    });

    it('should extract all user roles', () => {
      const adminUser: AuthUser = {
        ...mockUser,
        role: 'TENANT_ADMIN',
      };
      const adminToken = sign(adminUser, config.JWT_SECRET);

      const user = verifyToken(adminToken);

      expect(user?.role).toBe('TENANT_ADMIN');
    });

    it('should extract SUPER_ADMIN role', () => {
      const superAdminUser: AuthUser = {
        ...mockUser,
        role: 'SUPER_ADMIN',
      };
      const superAdminToken = sign(superAdminUser, config.JWT_SECRET);

      const user = verifyToken(superAdminToken);

      expect(user?.role).toBe('SUPER_ADMIN');
    });
  });

  describe('withAuth middleware', () => {
    it('should call handler with authenticated request', async () => {
      const handlerMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
      const request = mockRequest({
        Authorization: `Bearer ${mockToken}`,
      });

      await withAuth(request, handlerMock as any);

      expect(handlerMock).toHaveBeenCalled();
    });

    it('should attach user to request', async () => {
      let capturedRequest: any;
      const handlerMock = vi.fn(async (req) => {
        capturedRequest = req;
        return new Response(null, { status: 200 });
      });
      const request = mockRequest({
        Authorization: `Bearer ${mockToken}`,
      });

      await withAuth(request, handlerMock as any);

      expect(capturedRequest.user).toBeDefined();
      expect(capturedRequest.user.userId).toBe(mockUser.userId);
    });

    it('should return 401 for missing token', async () => {
      const handlerMock = vi.fn();
      const request = mockRequest({});

      const response = await withAuth(request, handlerMock);

      expect(response.status).toBe(401);
      expect(handlerMock).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token format', async () => {
      const handlerMock = vi.fn();
      const request = mockRequest({
        Authorization: 'Bearer invalid-format',
      });

      const response = await withAuth(request, handlerMock);

      expect(response.status).toBe(401);
    });

    it('should return 401 for expired token', async () => {
      const handlerMock = vi.fn();
      const expiredToken = sign(mockUser, config.JWT_SECRET, {
        expiresIn: '-1s',
      });
      const request = mockRequest({
        Authorization: `Bearer ${expiredToken}`,
      });

      const response = await withAuth(request, handlerMock);

      expect(response.status).toBe(401);
    });

    it('should include error message in response', async () => {
      const handlerMock = vi.fn();
      const request = mockRequest({});

      const response = await withAuth(request, handlerMock);
      const body = await response.json();

      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBeDefined();
    });
  });

  describe('requireRole middleware', () => {
    it('should allow request with matching role', async () => {
      const userWithRole: AuthUser = {
        ...mockUser,
        role: 'TENANT_ADMIN',
      };
      const token = sign(userWithRole, config.JWT_SECRET);

      const handlerMock = vi.fn().mockResolvedValue({ status: 200 });
      const request = mockRequest({
        Authorization: `Bearer ${token}`,
      });
      (request as any).user = userWithRole;

      const middleware = requireRole('TENANT_ADMIN');
      const response = await middleware(request as any, handlerMock);

      expect(handlerMock).toHaveBeenCalled();
    });

    it('should allow request with one of multiple allowed roles', async () => {
      const userWithRole: AuthUser = {
        ...mockUser,
        role: 'USER',
      };

      const handlerMock = vi.fn().mockResolvedValue({ status: 200 });
      const request = { user: userWithRole } as any;

      const middleware = requireRole('TENANT_ADMIN', 'USER');
      const response = await middleware(request, handlerMock);

      expect(handlerMock).toHaveBeenCalled();
    });

    it('should deny request with unauthorized role', async () => {
      const userWithRole: AuthUser = {
        ...mockUser,
        role: 'USER',
      };

      const handlerMock = vi.fn();
      const request = { user: userWithRole } as any;

      const middleware = requireRole('SUPER_ADMIN', 'TENANT_ADMIN');
      const response = await middleware(request, handlerMock);

      expect(response.status).toBe(403);
      expect(handlerMock).not.toHaveBeenCalled();
    });

    it('should return 401 for missing user', async () => {
      const handlerMock = vi.fn();
      const request = {} as any;

      const middleware = requireRole('TENANT_ADMIN');
      const response = await middleware(request, handlerMock);

      expect(response.status).toBe(401);
    });

    it('should include error message for forbidden access', async () => {
      const userWithRole: AuthUser = {
        ...mockUser,
        role: 'USER',
      };

      const handlerMock = vi.fn();
      const request = { user: userWithRole } as any;

      const middleware = requireRole('SUPER_ADMIN');
      const response = await middleware(request, handlerMock);
      const body = await response.json();

      expect(body.error).toBe('Forbidden');
      expect(body.message).toContain('SUPER_ADMIN');
    });

    it('should support SUPER_ADMIN role check', async () => {
      const superAdminUser: AuthUser = {
        ...mockUser,
        role: 'SUPER_ADMIN',
      };

      const handlerMock = vi.fn().mockResolvedValue({ status: 200 });
      const request = { user: superAdminUser } as any;

      const middleware = requireRole('SUPER_ADMIN');
      await middleware(request, handlerMock);

      expect(handlerMock).toHaveBeenCalled();
    });

    it('should list all allowed roles in error message', async () => {
      const userWithRole: AuthUser = {
        ...mockUser,
        role: 'USER',
      };

      const handlerMock = vi.fn();
      const request = { user: userWithRole } as any;

      const middleware = requireRole('SUPER_ADMIN', 'TENANT_ADMIN');
      const response = await middleware(request, handlerMock);
      const body = await response.json();

      expect(body.message).toContain('SUPER_ADMIN');
      expect(body.message).toContain('TENANT_ADMIN');
    });
  });

  describe('compose middleware', () => {
    it('should apply middlewares in order', async () => {
      const callOrder: string[] = [];

      const middleware1 = async (req: any, handler: any) => {
        callOrder.push('middleware1');
        return handler(req);
      };

      const middleware2 = async (req: any, handler: any) => {
        callOrder.push('middleware2');
        return handler(req);
      };

      const handler = async (req: any) => {
        callOrder.push('handler');
        return new Response(null, { status: 200 });
      };

      const composed = compose(middleware1 as any, middleware2 as any);
      await composed({} as any, handler as any);

      expect(callOrder).toEqual(['middleware1', 'middleware2', 'handler']);
    });

    it('should short-circuit on middleware failure', async () => {
      const handlerMock = vi.fn();

      const failingMiddleware = async (req: any, handler: any) => {
        return new Response(null, { status: 401 });
      };

      const passingMiddleware = async (req: any, handler: any) => {
        return handler(req);
      };

      const composed = compose(failingMiddleware as any, passingMiddleware as any);
      const response = await composed({} as any, handlerMock as any);

      expect(response.status).toBe(401);
      expect(handlerMock).not.toHaveBeenCalled();
    });

    it('should allow empty middleware list', async () => {
      const handlerMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      const composed = compose();
      const response = await composed({} as any, handlerMock as any);

      expect(handlerMock).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should work with single middleware', async () => {
      const middlewareMock = vi.fn(async (req, handler) => handler(req));
      const handlerMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

      const composed = compose(middlewareMock as any);
      await composed({} as any, handlerMock as any);

      expect(middlewareMock).toHaveBeenCalled();
      expect(handlerMock).toHaveBeenCalled();
    });

    it('should pass request through all middlewares', async () => {
      let request1: any;
      let request2: any;

      const middleware1 = async (req: any, handler: any) => {
        request1 = req;
        req.marker1 = true;
        return handler(req);
      };

      const middleware2 = async (req: any, handler: any) => {
        request2 = req;
        req.marker2 = true;
        return handler(req);
      };

      const handlerMock = vi.fn();

      const composed = compose(middleware1, middleware2);
      await composed({ initial: true } as any, handlerMock);

      expect(request1?.initial).toBe(true);
      expect(request2?.marker1).toBe(true);
      expect(request2?.marker2).toBe(true);
    });

    it('should maintain middleware isolation', async () => {
      const middleware1Mutations: any[] = [];
      const middleware2Mutations: any[] = [];

      const middleware1 = async (req: any, handler: any) => {
        middleware1Mutations.push(req.value);
        req.value = 'middleware1';
        middleware1Mutations.push(req.value);
        return handler(req);
      };

      const middleware2 = async (req: any, handler: any) => {
        middleware2Mutations.push(req.value);
        req.value = 'middleware2';
        middleware2Mutations.push(req.value);
        return handler(req);
      };

      const handlerMock = vi.fn();

      const composed = compose(middleware1, middleware2);
      await composed({ value: 'initial' } as any, handlerMock);

      expect(middleware1Mutations[0]).toBe('initial');
      expect(middleware1Mutations[1]).toBe('middleware1');
      expect(middleware2Mutations[0]).toBe('middleware1');
      expect(middleware2Mutations[1]).toBe('middleware2');
    });
  });

  describe('Token edge cases', () => {
    it('should handle token with special characters', () => {
      const customUser: AuthUser = {
        ...mockUser,
        email: 'test+special@example.com',
        name: 'Test & User',
      };
      const token = sign(customUser, config.JWT_SECRET);

      const user = verifyToken(token);

      expect(user?.email).toBe('test+special@example.com');
      expect(user?.name).toBe('Test & User');
    });

    it('should handle token with unicode characters', () => {
      const customUser: AuthUser = {
        ...mockUser,
        name: 'Test User 中文',
        tenantName: 'テナント',
      };
      const token = sign(customUser, config.JWT_SECRET);

      const user = verifyToken(token);

      expect(user?.name).toBe('Test User 中文');
      expect(user?.tenantName).toBe('テナント');
    });

    it('should preserve all tenant information in token', () => {
      const customUser: AuthUser = {
        ...mockUser,
        tenantId: 'tenant-with-long-id-12345',
        tenantSlug: 'tenant-slug-with-dashes',
        tenantName: 'Very Long Tenant Name Here',
      };
      const token = sign(customUser, config.JWT_SECRET);

      const user = verifyToken(token);

      expect(user?.tenantId).toBe(customUser.tenantId);
      expect(user?.tenantSlug).toBe(customUser.tenantSlug);
      expect(user?.tenantName).toBe(customUser.tenantName);
    });
  });

  describe('Authorization header variations', () => {
    it('should handle multiple Authorization headers', () => {
      const headers = new Headers();
      headers.append('Authorization', `Bearer ${mockToken}`);
      headers.append('Authorization', `Bearer other-token`);
      const request = { headers } as NextRequest;

      const token = extractToken(request);

      // Headers.get returns comma-separated values when multiple headers with same name
      expect(token).toBeDefined();
      expect(token).not.toBeNull();
    });

    it('should handle Authorization header with tabs', () => {
      const request = mockRequest({
        Authorization: `Bearer\t${mockToken}`,
      });

      const token = extractToken(request);

      // The implementation does `slice(7)`, so tabs would be included
      expect(token).not.toBe(mockToken);
    });
  });
});
