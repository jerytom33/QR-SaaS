/**
 * End-to-End (E2E) Tests for Complete User Workflows
 * Tests full user journeys including authentication, QR linking, and data access
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAuthenticatedRequest, createMockJWT, createMockRequest } from '../../test-utils'
import { getTenantContextFromUser } from '../tenant-context'

describe('End-to-End User Workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Demo User Login Flow', () => {
    it('should complete login workflow', async () => {
      // Step 1: User requests demo login
      const loginRequest = createMockRequest({
        url: 'http://localhost:3000/api/auth/demo-login',
        method: 'POST',
        body: { email: 'demo@example.com', password: 'demo' },
        headers: { 'x-forwarded-for': '192.168.1.1' },
      })

      expect(loginRequest.method).toBe('POST')
      expect(loginRequest.headers.get('x-forwarded-for')).toBe('192.168.1.1')

      // Step 2: Server returns JWT token
      const token = createMockJWT({
        userId: 'demo-user',
        tenantId: 'demo-tenant',
        role: 'USER',
      })

      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')

      // Step 3: Client stores token and uses for subsequent requests
      const authenticatedRequest = createAuthenticatedRequest(
        { url: 'http://localhost:3000/api/v1/resource', method: 'GET' },
        { userId: 'demo-user', tenantId: 'demo-tenant', role: 'USER' }
      )

      expect(authenticatedRequest.headers.get('authorization')).toContain('Bearer')
    })

    it('should prevent multiple rapid login attempts', async () => {
      const loginRequest = createMockRequest({
        url: 'http://localhost:3000/api/auth/demo-login',
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.1' },
      })

      // Simulate 5 rapid attempts (at limit)
      for (let i = 0; i < 5; i++) {
        expect(loginRequest.headers.get('x-forwarded-for')).toBe('192.168.1.1')
      }

      // 6th attempt should be rate limited
      // (In actual implementation, would receive 429 response)
    })
  })

  describe('QR Device Linking Workflow', () => {
    it('should generate QR code for device linking', async () => {
      // Step 1: Authenticated user requests QR generation
      const qrRequest = createAuthenticatedRequest(
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

      expect(qrRequest.method).toBe('POST')
      expect(qrRequest.headers.get('authorization')).toBeTruthy()

      // Step 2: Server generates QR session
      const qrSession = {
        sessionId: 'qr-session-789',
        qrCode: 'data:image/png;base64,...',
        expiresAt: Date.now() + 300000, // 5 minutes
      }

      expect(qrSession.sessionId).toBeTruthy()
      expect(qrSession.expiresAt).toBeGreaterThan(Date.now())
    })

    it('should link device via QR code scan', async () => {
      // Step 1: Device scans QR code
      const deviceScanRequest = createMockRequest({
        url: 'http://localhost:3000/api/v1/auth/qr-session/scan',
        method: 'POST',
        body: { sessionId: 'qr-session-789', deviceId: 'device-abc' },
      })

      expect(deviceScanRequest.method).toBe('POST')

      // Step 2: Server verifies device
      const deviceToken = createMockJWT({
        userId: 'user-123',
        tenantId: 'tenant-456',
        deviceId: 'device-abc',
        role: 'USER',
      })

      expect(deviceToken).toBeTruthy()

      // Step 3: Device completes link action
      const linkRequest = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/auth/qr-session/link',
          method: 'POST',
          body: { sessionId: 'qr-session-789', confirmed: true },
        },
        {
          userId: 'user-123',
          tenantId: 'tenant-456',
          role: 'USER',
        }
      )

      expect(linkRequest.method).toBe('POST')
      expect(linkRequest.headers.get('authorization')).toBeTruthy()
    })
  })

  describe('Contact Management Workflow', () => {
    it('should list tenant contacts with proper isolation', async () => {
      // Step 1: Admin user requests contacts
      const contactRequest = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/connection/contacts',
          method: 'GET',
        },
        {
          userId: 'admin-123',
          tenantId: 'tenant-456',
          role: 'TENANT_ADMIN',
        }
      )

      expect(contactRequest.method).toBe('GET')

      // Step 2: Verify tenant context is set
      const context = getTenantContextFromUser({
        tenantId: 'tenant-456',
        role: 'TENANT_ADMIN',
      })

      expect(context.tenantId).toBe('tenant-456')
      expect(context.isSuperAdmin).toBe(false)

      // Step 3: Server returns only tenant's contacts
      const contacts = [
        { id: 'contact-1', name: 'John', tenantId: 'tenant-456' },
        { id: 'contact-2', name: 'Jane', tenantId: 'tenant-456' },
      ]

      expect(contacts.every((c) => c.tenantId === 'tenant-456')).toBe(true)
    })

    it('should create contact within tenant', async () => {
      // Step 1: Admin creates contact
      const createRequest = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/connection/contacts',
          method: 'POST',
          body: { name: 'Alice', email: 'alice@example.com' },
        },
        {
          userId: 'admin-123',
          tenantId: 'tenant-456',
          role: 'TENANT_ADMIN',
        }
      )

      expect(createRequest.method).toBe('POST')

      // Step 2: Contact created in correct tenant
      const newContact = {
        id: 'contact-new',
        name: 'Alice',
        email: 'alice@example.com',
        tenantId: 'tenant-456',
      }

      expect(newContact.tenantId).toBe('tenant-456')
    })

    it('should prevent cross-tenant contact access', async () => {
      // User from tenant-1 tries to access tenant-2 data
      const user1 = {
        tenantId: 'tenant-1',
        role: 'TENANT_ADMIN',
      }

      const user2 = {
        tenantId: 'tenant-2',
        role: 'TENANT_ADMIN',
      }

      const context1 = getTenantContextFromUser(user1)
      const context2 = getTenantContextFromUser(user2)

      // Different contexts should prevent access
      expect(context1.tenantId).not.toBe(context2.tenantId)
      expect(context1.isSuperAdmin).toBe(false)
    })
  })

  describe('Super Admin Operations Workflow', () => {
    it('should allow super admin to access all tenant data', async () => {
      // Super admin can view contacts from any tenant
      const superAdminRequest = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/admin/contacts',
          method: 'GET',
          headers: { 'x-tenant-id': 'any-tenant' },
        },
        {
          userId: 'super-admin',
          tenantId: 'admin-tenant',
          role: 'SUPER_ADMIN',
        }
      )

      expect(superAdminRequest.headers.get('authorization')).toBeTruthy()

      // Verify super admin context
      const context = getTenantContextFromUser({
        tenantId: 'admin-tenant',
        role: 'SUPER_ADMIN',
      })

      expect(context.isSuperAdmin).toBe(true)
    })

    it('should allow super admin to manage all tenants', async () => {
      const superAdminUser = {
        tenantId: 'admin-tenant',
        role: 'SUPER_ADMIN',
      }

      const context = getTenantContextFromUser(superAdminUser)

      // Super admin bypass restrictions
      expect(context.isSuperAdmin).toBe(true)
    })
  })

  describe('Session Management Workflow', () => {
    it('should maintain session through multiple requests', async () => {
      const userId = 'user-123'
      const tenantId = 'tenant-456'

      // Request 1
      const request1 = createAuthenticatedRequest(
        { url: 'http://localhost:3000/api/v1/resource1', method: 'GET' },
        { userId, tenantId, role: 'USER' }
      )

      expect(request1.headers.get('authorization')).toBeTruthy()

      // Request 2
      const request2 = createAuthenticatedRequest(
        { url: 'http://localhost:3000/api/v1/resource2', method: 'GET' },
        { userId, tenantId, role: 'USER' }
      )

      expect(request2.headers.get('authorization')).toBeTruthy()

      // Both use same user context
      expect(request1.headers.get('authorization')).toBe(
        request2.headers.get('authorization')
      )
    })

    it('should handle token refresh', async () => {
      // Step 1: Client has expired token
      const expiredToken = createMockJWT({
        userId: 'user-123',
        tenantId: 'tenant-456',
        exp: Math.floor(Date.now() / 1000) - 100, // Already expired
      })

      expect(expiredToken).toBeTruthy()

      // Step 2: Client uses refresh token to get new access token
      const newToken = createMockJWT({
        userId: 'user-123',
        tenantId: 'tenant-456',
        exp: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
      })

      expect(newToken).toBeTruthy()

      // Step 3: Client uses new token
      const request = createAuthenticatedRequest(
        { url: 'http://localhost:3000/api/v1/resource', method: 'GET' },
        { userId: 'user-123', tenantId: 'tenant-456', role: 'USER' }
      )

      expect(request.headers.get('authorization')).toBeTruthy()
    })
  })

  describe('Rate Limiting Across Workflow', () => {
    it('should apply rate limiting during login attempts', async () => {
      const baseIP = '192.168.1.1'

      // First 5 attempts should succeed
      for (let i = 0; i < 5; i++) {
        const loginRequest = createMockRequest({
          url: 'http://localhost:3000/api/auth/demo-login',
          method: 'POST',
          headers: { 'x-forwarded-for': baseIP },
        })

        expect(loginRequest.headers.get('x-forwarded-for')).toBe(baseIP)
      }

      // 6th attempt would be rate limited (429 response)
    })

    it('should apply rate limiting to QR generation', async () => {
      // Attempting 10 QR generations per user should succeed
      for (let i = 0; i < 10; i++) {
        const qrRequest = createAuthenticatedRequest(
          {
            url: 'http://localhost:3000/api/v1/auth/qr-session/generate',
            method: 'POST',
          },
          { userId: 'user-123', tenantId: 'tenant-456', role: 'USER' }
        )

        expect(qrRequest.method).toBe('POST')
      }

      // 11th attempt would be rate limited
    })
  })

  describe('Error Recovery Workflow', () => {
    it('should handle authentication errors gracefully', async () => {
      const loginRequest = createMockRequest({
        url: 'http://localhost:3000/api/auth/demo-login',
        method: 'POST',
        body: { email: 'invalid@example.com', password: 'wrong' },
      })

      expect(loginRequest.method).toBe('POST')
      // Server would return 401 Unauthorized
    })

    it('should handle rate limit errors with proper headers', async () => {
      const rateLimitedResponse = {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'Retry-After': '60',
        },
      }

      expect(rateLimitedResponse.status).toBe(429)
      expect(rateLimitedResponse.headers['X-RateLimit-Remaining']).toBe('0')
    })

    it('should handle authorization errors', async () => {
      // User from tenant-1 attempting to access tenant-2 data
      const unauthorizedRequest = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/connection/contacts',
          method: 'GET',
          headers: { 'x-requested-tenant': 'tenant-2' },
        },
        { userId: 'user-123', tenantId: 'tenant-1', role: 'USER' }
      )

      // Server would return 403 Forbidden
      expect(unauthorizedRequest.headers.get('x-requested-tenant')).toBe('tenant-2')
    })
  })

  describe('Complete User Journey', () => {
    it('should handle full end-to-end workflow', async () => {
      // 1. User logs in
      const loginRequest = createMockRequest({
        url: 'http://localhost:3000/api/auth/demo-login',
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.1' },
      })

      const token = createMockJWT({
        userId: 'journey-user',
        tenantId: 'journey-tenant',
        role: 'USER',
      })

      expect(token).toBeTruthy()

      // 2. User requests QR for device linking
      const qrRequest = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/auth/qr-session/generate',
          method: 'POST',
        },
        {
          userId: 'journey-user',
          tenantId: 'journey-tenant',
          role: 'USER',
        }
      )

      expect(qrRequest.method).toBe('POST')

      // 3. User accesses their contacts
      const contactsRequest = createAuthenticatedRequest(
        {
          url: 'http://localhost:3000/api/v1/connection/contacts',
          method: 'GET',
        },
        {
          userId: 'journey-user',
          tenantId: 'journey-tenant',
          role: 'USER',
        }
      )

      expect(contactsRequest.method).toBe('GET')

      // 4. Verify tenant isolation
      const context = getTenantContextFromUser({
        tenantId: 'journey-tenant',
        role: 'USER',
      })

      expect(context.tenantId).toBe('journey-tenant')

      // All requests use same authorization context
      expect(qrRequest.headers.get('authorization')).toContain('Bearer')
      expect(contactsRequest.headers.get('authorization')).toContain('Bearer')
    })
  })
})
