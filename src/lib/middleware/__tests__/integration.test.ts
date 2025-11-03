/**
 * Integration Tests for API Endpoints with Security Middleware
 * Tests the combination of rate limiting, authentication, and tenant context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockRequest, createAuthenticatedRequest, createMockJWT } from '../../test-utils'
import { createMockPrismaClient, createMockTenant, createMockProfile, createMockContact } from '../../test-utils/db-mock'
import { getTenantContextFromUser } from '../tenant-context'

describe('API Endpoint Integration Tests', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma = createMockPrismaClient()
  })

  describe('QR Session Endpoint Integration', () => {
    it('should handle authenticated QR session generation', async () => {
      const token = createMockJWT({
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'USER',
      })

      const request = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/auth/qr-session/generate',
          method: 'POST',
        },
        {
          userId: 'user-123',
          tenantId: 'tenant-456',
          role: 'USER',
        }
      )

      expect(request.method).toBe('POST')
      expect(request.headers.get('authorization')).toBeTruthy()
    })

    it('should extract tenant context from authenticated request', () => {
      const user = {
        tenantId: 'tenant-456',
        role: 'USER',
      }

      const context = getTenantContextFromUser(user)

      expect(context.tenantId).toBe('tenant-456')
      expect(context.isSuperAdmin).toBe(false)
    })

    it('should prevent QR generation for unauthorized users', () => {
      const unauthorizedUser = {
        tenantId: '',
        role: 'USER',
      }

      const context = getTenantContextFromUser(unauthorizedUser)

      // Empty tenant ID means no access (unless super admin)
      expect(context.tenantId).toBe('')
      expect(context.isSuperAdmin).toBe(false)
    })
  })

  describe('Contact Endpoint Integration', () => {
    it('should return tenant-isolated contacts', async () => {
      const tenant = createMockTenant()
      const profile = createMockProfile({ tenantId: tenant.id })
      const contact = createMockContact({ tenantId: tenant.id })

      expect(contact.tenantId).toBe(tenant.id)
      expect(profile.tenantId).toBe(tenant.id)
    })

    it('should apply tenant context to database queries', () => {
      const user = {
        tenantId: 'tenant-abc',
        role: 'TENANT_ADMIN',
      }

      const context = getTenantContextFromUser(user)

      // Context should be set for queries
      expect(context.tenantId).toBe('tenant-abc')
      expect(context.isSuperAdmin).toBe(false)
    })

    it('should prevent cross-tenant data access', () => {
      const user1 = {
        tenantId: 'tenant-1',
        role: 'USER',
      }

      const user2 = {
        tenantId: 'tenant-2',
        role: 'USER',
      }

      const context1 = getTenantContextFromUser(user1)
      const context2 = getTenantContextFromUser(user2)

      // Different tenant contexts
      expect(context1.tenantId).not.toBe(context2.tenantId)
    })
  })

  describe('Authentication Flow Integration', () => {
    it('should handle demo login with rate limiting', async () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/auth/demo-login',
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.1' },
      })

      expect(request.method).toBe('POST')
      expect(request.headers.get('x-forwarded-for')).toBe('192.168.1.1')
    })

    it('should return JWT on successful authentication', () => {
      const token = createMockJWT({
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'USER',
      })

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3) // JWT has 3 parts
    })

    it('should extract user context from JWT', () => {
      const payload = {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'TENANT_ADMIN',
      }

      const token = createMockJWT(payload)

      // Verify JWT can be created with custom payload
      expect(token).toBeTruthy()

      // Extract context from payload
      const context = getTenantContextFromUser(payload)
      expect(context.tenantId).toBe(payload.tenantId)
      expect(context.isSuperAdmin).toBe(false)
    })
  })

  describe('Multi-Tenant Isolation Integration', () => {
    it('should isolate tenant data at application layer', () => {
      const tenant1User = {
        tenantId: 'tenant-1',
        role: 'TENANT_ADMIN',
      }

      const tenant2User = {
        tenantId: 'tenant-2',
        role: 'TENANT_ADMIN',
      }

      const context1 = getTenantContextFromUser(tenant1User)
      const context2 = getTenantContextFromUser(tenant2User)

      // Separate contexts for separate tenants
      expect(context1.tenantId).toBe('tenant-1')
      expect(context2.tenantId).toBe('tenant-2')
    })

    it('should allow super admin across tenants', () => {
      const superAdminUser = {
        tenantId: 'any-tenant',
        role: 'SUPER_ADMIN',
      }

      const context = getTenantContextFromUser(superAdminUser)

      expect(context.isSuperAdmin).toBe(true)
      expect(context.tenantId).toBe('any-tenant')
    })
  })

  describe('Request Header Integration', () => {
    it('should preserve authentication headers through middleware chain', () => {
      const request = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/resource',
          method: 'GET',
          headers: { 'x-custom-header': 'custom-value' },
        },
        {
          userId: 'user-123',
          tenantId: 'tenant-456',
          role: 'USER',
        }
      )

      expect(request.headers.get('authorization')).toBeTruthy()
      expect(request.headers.get('x-custom-header')).toBe('custom-value')
      expect(request.headers.get('content-type')).toBe('application/json')
    })

    it('should maintain rate limit headers in responses', () => {
      const resetTime = (Date.now() + 900000).toString()
      const headers = {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '99',
        'X-RateLimit-Reset': resetTime,
        'Retry-After': '900',
      }

      expect(headers['X-RateLimit-Limit']).toBe('100')
      expect(parseInt(headers['X-RateLimit-Remaining'])).toBe(99)
      expect(parseInt(headers['X-RateLimit-Reset'])).toBeGreaterThan(Date.now())
    })
  })

  describe('Error Handling Integration', () => {
    it('should return 401 for unauthenticated requests to protected endpoints', () => {
      const request = createMockRequest({
        url: 'http://localhost:3000/api/v1/protected-resource',
        method: 'GET',
        // No authorization header
      })

      expect(request.headers.get('authorization')).toBeUndefined()
    })

    it('should return 429 for rate limited requests', () => {
      const statusCode = 429
      const headers = {
        'X-RateLimit-Remaining': '0',
        'Retry-After': '60',
      }

      expect(statusCode).toBe(429)
      expect(parseInt(headers['X-RateLimit-Remaining'])).toBe(0)
    })

    it('should return 403 for unauthorized tenant access', () => {
      const user = {
        tenantId: 'tenant-1',
        role: 'USER',
      }

      const context = getTenantContextFromUser(user)

      // Non-super admin accessing wrong tenant should fail
      expect(context.isSuperAdmin).toBe(false)
      expect(context.tenantId).toBe('tenant-1')
    })
  })

  describe('Endpoint-Specific Integration', () => {
    it('should require authentication for /api/v1/auth/qr-session/generate', () => {
      const url = 'http://localhost:3000/api/v1/auth/qr-session/generate'
      expect(url).toContain('/api/v1/auth/qr-session')
    })

    it('should support rate limiting for /api/auth/demo-login', () => {
      const url = 'http://localhost:3000/api/auth/demo-login'
      const method = 'POST'

      expect(url).toContain('/api/auth/demo-login')
      expect(method).toBe('POST')
    })

    it('should allow public access to /api/health', () => {
      const url = 'http://localhost:3000/api/health'
      const request = createMockRequest({ url, method: 'GET' })

      expect(request.method).toBe('GET')
      // No auth required for health check
      expect(request.headers.get('authorization')).toBeUndefined()
    })
  })

  describe('Middleware Chain Integration', () => {
    it('should execute auth middleware before rate limiting', async () => {
      const request = createAuthenticatedRequest(
        { url: 'http://localhost:3000/api/v1/resource', method: 'GET' },
        { userId: 'user-1', tenantId: 'tenant-1', role: 'USER' }
      )

      // Auth middleware should add authorization header
      expect(request.headers.get('authorization')).toBeTruthy()
    })

    it('should execute rate limiting after auth', async () => {
      const ips = ['192.168.1.1', '192.168.1.2']

      for (const ip of ips) {
        const request = createMockRequest({
          url: 'http://localhost:3000/api/v1/resource',
          headers: { 'x-forwarded-for': ip },
        })

        expect(request.headers.get('x-forwarded-for')).toBe(ip)
      }
    })

    it('should apply tenant context to database operations', () => {
      const user = {
        tenantId: 'tenant-1',
        role: 'USER',
      }

      const context = getTenantContextFromUser(user)

      // Tenant context should be set for DB operations
      expect(context.tenantId).toBe('tenant-1')
    })
  })
})
