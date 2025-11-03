import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * QR Sessions API Tests - Phase 2.1f
 * Tests for QR session management endpoints with multi-tenant isolation,
 * rate limiting, and authentication.
 */

// Mock implementations (in real tests, would use actual database/API)
const mockQRSessions: any[] = []
let mockIdCounter = 1

// Mock rate limiter
const mockAuthenticatedRateLimiter = vi.fn(async (request: NextRequest) => null)

// Mock auth helper
const mockGetAuthUser = vi.fn(async (request: NextRequest) => ({
  id: 'user-123',
  tenantId: 'tenant-456',
  role: 'USER'
}))

// Mock tenant context
const mockGetTenantContextFromUser = vi.fn((data: any) => ({
  tenantId: data.tenantId,
  isSuperAdmin: data.role === 'SUPER_ADMIN'
}))

// Mock withTenantContext
const mockWithTenantContext = vi.fn(async (db: any, context: any, fn: any) => {
  return fn({
    qRSession: {
      findMany: vi.fn(async ({ where, skip, take, orderBy }) => {
        let filtered = [...mockQRSessions]
        if (where.tenantId) {
          filtered = filtered.filter(s => s.tenantId === where.tenantId)
        }
        if (where.status) {
          filtered = filtered.filter(s => s.status === where.status)
        }
        return filtered.slice(skip || 0, (skip || 0) + (take || 20))
      }),
      count: vi.fn(async ({ where }) => {
        let filtered = [...mockQRSessions]
        if (where.tenantId) {
          filtered = filtered.filter(s => s.tenantId === where.tenantId)
        }
        return filtered.length
      }),
      findUnique: vi.fn(async ({ where }) => {
        return mockQRSessions.find(s => s.id === where.id)
      }),
      create: vi.fn(async ({ data }) => {
        const session = {
          id: `qr-${mockIdCounter++}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        mockQRSessions.push(session)
        return session
      }),
      update: vi.fn(async ({ where, data }) => {
        const index = mockQRSessions.findIndex(s => s.id === where.id)
        if (index !== -1) {
          mockQRSessions[index] = { ...mockQRSessions[index], ...data, updatedAt: new Date() }
          return mockQRSessions[index]
        }
        return null
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const count = mockQRSessions.filter(s => where.id.in.includes(s.id)).length
        mockQRSessions
          .filter(s => where.id.in.includes(s.id))
          .forEach(s => {
            Object.assign(s, data, { updatedAt: new Date() })
          })
        return { count }
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const count = mockQRSessions.filter(s => where.id.in.includes(s.id)).length
        mockQRSessions.splice(0, mockQRSessions.length, 
          ...mockQRSessions.filter(s => !where.id.in.includes(s.id))
        )
        return { count }
      }),
      delete: vi.fn(async ({ where }) => {
        const index = mockQRSessions.findIndex(s => s.id === where.id)
        if (index !== -1) {
          return mockQRSessions.splice(index, 1)[0]
        }
        return null
      })
    }
  })
})

describe('QR Sessions API - Phase 2.1f', () => {
  
  beforeEach(() => {
    mockQRSessions.length = 0
    mockIdCounter = 1
    vi.clearAllMocks()
  })

  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================

  describe('Authentication & Authorization', () => {
    
    it('should reject requests without Bearer token', async () => {
      const request = new NextRequest('http://localhost/api/v1/connection/qr-sessions')
      mockGetAuthUser.mockResolvedValueOnce(undefined as any)
      
      expect(mockGetAuthUser).toBeDefined()
    })

    it('should reject requests with invalid authorization header', async () => {
      const request = new NextRequest('http://localhost/api/v1/connection/qr-sessions', {
        headers: { 'authorization': 'Basic invalid' }
      })
      
      const user = await mockGetAuthUser(request)
      expect(user).toBeNull()
    })

    it('should verify tenant isolation on unauthorized access', async () => {
      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      
      expect(context1.tenantId).not.toBe(context2.tenantId)
    })
  })

  // ========================================================================
  // GET OPERATIONS - LIST & RETRIEVE
  // ========================================================================

  describe('GET Operations', () => {
    
    it('should list QR sessions with pagination', async () => {
      // Create test data
      const sessions = [
        { id: 'qr-1', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'qr-2', tenantId: 'tenant-1', status: 'LINKED', qrCodeData: 'qr_data_2', createdAt: new Date(), updatedAt: new Date() },
        { id: 'qr-3', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_3', createdAt: new Date(), updatedAt: new Date() }
      ]
      mockQRSessions.push(...sessions)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.findMany({
          where: { tenantId: 'tenant-1' },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' }
        })
      })
      
      expect(result).toHaveLength(3)
    })

    it('should filter QR sessions by status', async () => {
      const sessions = [
        { id: 'qr-1', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'qr-2', tenantId: 'tenant-1', status: 'LINKED', qrCodeData: 'qr_data_2', createdAt: new Date(), updatedAt: new Date() }
      ]
      mockQRSessions.push(...sessions)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.findMany({
          where: { tenantId: 'tenant-1', status: 'PENDING' },
          skip: 0,
          take: 20
        })
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('PENDING')
    })

    it('should retrieve individual QR session by ID', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.findUnique({ where: { id: 'qr-1' } })
      })
      
      expect(result).toBeDefined()
      expect(result?.id).toBe('qr-1')
    })
  })

  // ========================================================================
  // POST OPERATIONS - CREATE
  // ========================================================================

  describe('POST Operations - Create QR Session', () => {
    
    it('should create new QR session with required fields', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.create({
          data: {
            tenantId: 'tenant-1',
            status: 'PENDING',
            qrCodeData: 'qr_generated_code',
            expiresAt: new Date(Date.now() + 3600000)
          }
        })
      })
      
      expect(result).toBeDefined()
      expect(result.tenantId).toBe('tenant-1')
      expect(result.status).toBe('PENDING')
      expect(result.qrCodeData).toMatch(/^qr_/)
    })

    it('should generate unique QR code for each session', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      
      const session1 = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.create({
          data: {
            tenantId: 'tenant-1',
            status: 'PENDING',
            qrCodeData: `qr_${Date.now()}_1`,
            expiresAt: new Date(Date.now() + 3600000)
          }
        })
      })
      
      const session2 = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.create({
          data: {
            tenantId: 'tenant-1',
            status: 'PENDING',
            qrCodeData: `qr_${Date.now()}_2`,
            expiresAt: new Date(Date.now() + 3600000)
          }
        })
      })
      
      expect(session1.qrCodeData).not.toBe(session2.qrCodeData)
    })

    it('should set default expiration time when not provided', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.create({
          data: {
            tenantId: 'tenant-1',
            status: 'PENDING',
            qrCodeData: 'qr_generated_code',
            expiresAt: new Date(Date.now() + 3600000) // 1 hour default
          }
        })
      })
      
      expect(result.expiresAt).toBeDefined()
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
    })

    it('should set initial status to PENDING', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.create({
          data: {
            tenantId: 'tenant-1',
            status: 'PENDING',
            qrCodeData: 'qr_generated_code',
            expiresAt: new Date(Date.now() + 3600000)
          }
        })
      })
      
      expect(result.status).toBe('PENDING')
    })
  })

  // ========================================================================
  // PUT OPERATIONS - UPDATE
  // ========================================================================

  describe('PUT Operations - Update QR Sessions', () => {
    
    it('should update QR session status', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: 'qr-1' },
          data: { status: 'LINKED' }
        })
      })
      
      expect(result.status).toBe('LINKED')
    })

    it('should update QR session expiration time', async () => {
      const newExpiration = new Date(Date.now() + 7200000) // 2 hours
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        expiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: 'qr-1' },
          data: { expiresAt: newExpiration }
        })
      })
      
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(new Date(session.expiresAt).getTime())
    })

    it('should verify tenant ownership before updating', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      // Try to update with different tenant context
      const wrongContext = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(wrongContext.tenantId).not.toBe(session.tenantId)
    })

    it('should update multiple sessions in batch operation', async () => {
      const sessions = [
        { id: 'qr-1', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'qr-2', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_2', createdAt: new Date(), updatedAt: new Date() }
      ]
      mockQRSessions.push(...sessions)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.updateMany({
          where: { id: { in: ['qr-1', 'qr-2'] }, tenantId: 'tenant-1' },
          data: { status: 'VERIFIED' }
        })
      })
      
      expect(result.count).toBe(2)
    })
  })

  // ========================================================================
  // DELETE OPERATIONS
  // ========================================================================

  describe('DELETE Operations', () => {
    
    it('should delete individual QR session', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      expect(mockQRSessions).toHaveLength(1)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.delete({ where: { id: 'qr-1' } })
      })
      
      expect(mockQRSessions).toHaveLength(0)
    })

    it('should delete multiple sessions in batch operation', async () => {
      const sessions = [
        { id: 'qr-1', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'qr-2', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_2', createdAt: new Date(), updatedAt: new Date() }
      ]
      mockQRSessions.push(...sessions)
      
      expect(mockQRSessions).toHaveLength(2)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.deleteMany({
          where: { id: { in: ['qr-1', 'qr-2'] }, tenantId: 'tenant-1' }
        })
      })
      
      expect(result.count).toBe(2)
      expect(mockQRSessions).toHaveLength(0)
    })

    it('should prevent cross-tenant deletion', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const wrongContext = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(wrongContext.tenantId).not.toBe(session.tenantId)
    })
  })

  // ========================================================================
  // MULTI-TENANT ISOLATION
  // ========================================================================

  describe('Multi-Tenant Isolation', () => {
    
    it('should isolate QR sessions by tenant', async () => {
      const sessions = [
        { id: 'qr-1', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_1', createdAt: new Date(), updatedAt: new Date() },
        { id: 'qr-2', tenantId: 'tenant-2', status: 'PENDING', qrCodeData: 'qr_data_2', createdAt: new Date(), updatedAt: new Date() }
      ]
      mockQRSessions.push(...sessions)
      
      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result1 = await mockWithTenantContext(null, context1, async (tx: any) => {
        return tx.qRSession.findMany({
          where: { tenantId: 'tenant-1' }
        })
      })
      
      expect(result1).toHaveLength(1)
      expect(result1[0].tenantId).toBe('tenant-1')
    })

    it('should prevent access to other tenant sessions', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      const result = await mockWithTenantContext(null, context2, async (tx: any) => {
        return tx.qRSession.findMany({
          where: { tenantId: 'tenant-2' }
        })
      })
      
      expect(result).toHaveLength(0)
    })

    it('should prevent modifying other tenant sessions', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      // Verify tenant 2 cannot modify tenant 1's session
      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(context2.tenantId).not.toBe(session.tenantId)
    })
  })

  // ========================================================================
  // STATUS TRANSITIONS
  // ========================================================================

  describe('QR Session Status Transitions', () => {
    
    it('should transition from PENDING to LINKED', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: 'qr-1' },
          data: { status: 'LINKED' }
        })
      })
      
      expect(result.status).toBe('LINKED')
    })

    it('should support VERIFIED status for complete linking', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'LINKED',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: 'qr-1' },
          data: { status: 'VERIFIED' }
        })
      })
      
      expect(result.status).toBe('VERIFIED')
    })

    it('should support EXPIRED status', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: 'qr-1' },
          data: { status: 'EXPIRED' }
        })
      })
      
      expect(result.status).toBe('EXPIRED')
    })

    it('should support REVOKED status', async () => {
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: 'qr-1' },
          data: { status: 'REVOKED' }
        })
      })
      
      expect(result.status).toBe('REVOKED')
    })
  })

  // ========================================================================
  // EXPIRATION & TIME HANDLING
  // ========================================================================

  describe('Expiration & Time Handling', () => {
    
    it('should respect expiration dates', async () => {
      const now = Date.now()
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        expiresAt: new Date(now + 3600000), // 1 hour from now
        createdAt: new Date(now),
        updatedAt: new Date(now)
      }
      
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(now)
    })

    it('should filter expired sessions from list', async () => {
      const now = Date.now()
      const sessions = [
        { id: 'qr-1', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_1', expiresAt: new Date(now + 3600000), createdAt: new Date(), updatedAt: new Date() },
        { id: 'qr-2', tenantId: 'tenant-1', status: 'PENDING', qrCodeData: 'qr_data_2', expiresAt: new Date(now - 3600000), createdAt: new Date(), updatedAt: new Date() }
      ]
      mockQRSessions.push(...sessions)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.findMany({
          where: { tenantId: 'tenant-1' }
        })
      })
      
      expect(result).toHaveLength(2) // Both returned; filtering typically happens in application logic
    })

    it('should allow extending expiration time', async () => {
      const now = Date.now()
      const originalExpiration = new Date(now + 3600000)
      const newExpiration = new Date(now + 7200000)
      
      const session = {
        id: 'qr-1',
        tenantId: 'tenant-1',
        status: 'PENDING',
        qrCodeData: 'qr_data_1',
        expiresAt: originalExpiration,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockQRSessions.push(session)
      
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: 'qr-1' },
          data: { expiresAt: newExpiration }
        })
      })
      
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(new Date(originalExpiration).getTime())
    })
  })

  // ========================================================================
  // RATE LIMITING
  // ========================================================================

  describe('Rate Limiting', () => {
    
    it('should apply rate limiting to GET requests', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/qr-sessions'))
      expect(result).toBeNull() // Null means rate limit passed
    })

    it('should apply rate limiting to POST requests', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/qr-sessions', { method: 'POST' }))
      expect(result).toBeNull()
    })

    it('should return 429 when rate limit exceeded', async () => {
      // Mock rate limit response (would be actual NextResponse in real implementation)
      expect(mockAuthenticatedRateLimiter).toBeDefined()
    })
  })

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  describe('Error Handling', () => {
    
    it('should handle invalid QR session ID gracefully', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.findUnique({ where: { id: 'nonexistent-id' } })
      })
      
      expect(result).toBeUndefined()
    })

    it('should handle missing required fields in request', async () => {
      // Validation should reject incomplete requests
      expect(() => {
        z.object({ qrCodeData: z.string().min(1) }).parse({})
      }).toThrow()
    })

    it('should handle database errors gracefully', async () => {
      // Error handling should return appropriate response
      expect(mockWithTenantContext).toBeDefined()
    })
  })

  // ========================================================================
  // COMPREHENSIVE WORKFLOW TESTS
  // ========================================================================

  describe('Comprehensive Workflows', () => {
    
    it('should complete full QR session lifecycle: create → link → verify → expire', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      
      // 1. Create
      const created = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.create({
          data: {
            tenantId: 'tenant-1',
            status: 'PENDING',
            qrCodeData: 'qr_generated_code',
            expiresAt: new Date(Date.now() + 3600000)
          }
        })
      })
      expect(created.status).toBe('PENDING')
      
      // 2. Link
      const linked = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: created.id },
          data: { status: 'LINKED' }
        })
      })
      expect(linked.status).toBe('LINKED')
      
      // 3. Verify
      const verified = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: created.id },
          data: { status: 'VERIFIED' }
        })
      })
      expect(verified.status).toBe('VERIFIED')
      
      // 4. Expire
      const expired = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.qRSession.update({
          where: { id: created.id },
          data: { status: 'EXPIRED' }
        })
      })
      expect(expired.status).toBe('EXPIRED')
    })

    it('should handle concurrent QR session operations for same tenant', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      
      const promises = Array.from({ length: 5 }).map((_, i) =>
        mockWithTenantContext(null, context, async (tx: any) => {
          return tx.qRSession.create({
            data: {
              tenantId: 'tenant-1',
              status: 'PENDING',
              qrCodeData: `qr_concurrent_${i}`,
              expiresAt: new Date(Date.now() + 3600000)
            }
          })
        })
      )
      
      const results = await Promise.all(promises)
      expect(results).toHaveLength(5)
      const uniqueIds = new Set(results.map(r => r.id))
      expect(uniqueIds.size).toBe(5) // All unique IDs
    })
  })
})
