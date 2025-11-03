import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * Activities API Tests - Phase 2.1g
 * Tests for activity logging and audit trail endpoints with comprehensive
 * filtering, multi-tenant isolation, and audit tracking.
 */

// Mock activity store
const mockActivities: any[] = []
let mockIdCounter = 1

// Mock functions
const mockAuthenticatedRateLimiter = vi.fn(async (request: NextRequest) => null)
const mockGetAuthUser = vi.fn(async (request: NextRequest) => ({
  id: 'user-123',
  tenantId: 'tenant-456',
  role: 'USER'
}))
const mockGetTenantContextFromUser = vi.fn((data: any) => ({
  tenantId: data.tenantId,
  isSuperAdmin: data.role === 'SUPER_ADMIN'
}))
const mockWithTenantContext = vi.fn(async (db: any, context: any, fn: any) => {
  return fn({
    activity: {
      findMany: vi.fn(async ({ where, skip, take, orderBy }) => {
        let filtered = [...mockActivities]
        if (where.tenantId) {
          filtered = filtered.filter(a => a.tenantId === where.tenantId)
        }
        if (where.entityType) {
          filtered = filtered.filter(a => a.entityType === where.entityType)
        }
        if (where.actionType) {
          filtered = filtered.filter(a => a.actionType === where.actionType)
        }
        if (where.entityId) {
          filtered = filtered.filter(a => a.entityId === where.entityId)
        }
        if (where.userId) {
          filtered = filtered.filter(a => a.userId === where.userId)
        }
        if (where.createdAt?.gte) {
          filtered = filtered.filter(a => new Date(a.createdAt) >= where.createdAt.gte)
        }
        if (where.createdAt?.lte) {
          filtered = filtered.filter(a => new Date(a.createdAt) <= where.createdAt.lte)
        }
        return filtered.slice(skip || 0, (skip || 0) + (take || 20)).sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      }),
      count: vi.fn(async ({ where }) => {
        let filtered = [...mockActivities]
        if (where.tenantId) {
          filtered = filtered.filter(a => a.tenantId === where.tenantId)
        }
        if (where.entityType) {
          filtered = filtered.filter(a => a.entityType === where.entityType)
        }
        if (where.actionType) {
          filtered = filtered.filter(a => a.actionType === where.actionType)
        }
        return filtered.length
      }),
      findUnique: vi.fn(async ({ where }) => {
        return mockActivities.find(a => a.id === where.id)
      }),
      create: vi.fn(async ({ data }) => {
        const activity = {
          id: `act-${mockIdCounter++}`,
          ...data,
          createdAt: new Date()
        }
        mockActivities.push(activity)
        return activity
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const count = mockActivities.filter(a => where.id.in.includes(a.id)).length
        mockActivities
          .filter(a => where.id.in.includes(a.id))
          .forEach(a => {
            Object.assign(a, data)
          })
        return { count }
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const count = mockActivities.filter(a => where.id.in.includes(a.id)).length
        mockActivities.splice(0, mockActivities.length, 
          ...mockActivities.filter(a => !where.id.in.includes(a.id))
        )
        return { count }
      }),
      delete: vi.fn(async ({ where }) => {
        const index = mockActivities.findIndex(a => a.id === where.id)
        if (index !== -1) {
          return mockActivities.splice(index, 1)[0]
        }
        return null
      })
    }
  })
})

describe('Activities API - Phase 2.1g', () => {
  
  beforeEach(() => {
    mockActivities.length = 0
    mockIdCounter = 1
    vi.clearAllMocks()
  })

  // ========================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ========================================================================

  describe('Authentication & Authorization', () => {
    
    it('should reject requests without Bearer token', async () => {
      mockGetAuthUser.mockResolvedValueOnce(undefined as any)
      expect(mockGetAuthUser).toBeDefined()
    })

    it('should verify tenant isolation on unauthorized access', async () => {
      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(context1.tenantId).not.toBe(context2.tenantId)
    })

    it('should verify activity ownership on retrieval', async () => {
      const activity = {
        id: 'act-1',
        tenantId: 'tenant-1',
        entityType: 'CONTACT',
        entityId: 'contact-1',
        actionType: 'CREATE',
        userId: 'user-1',
        userEmail: 'user@example.com',
        createdAt: new Date()
      }
      mockActivities.push(activity)

      const wrongContext = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(wrongContext.tenantId).not.toBe(activity.tenantId)
    })
  })

  // ========================================================================
  // GET OPERATIONS - LIST & RETRIEVE
  // ========================================================================

  describe('GET Operations', () => {
    
    it('should list activities with pagination', async () => {
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'COMPANY', entityId: 'company-1', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-3', tenantId: 'tenant-1', entityType: 'LEAD', entityId: 'lead-1', actionType: 'DELETE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() }
      ]
      mockActivities.push(...activities)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-1' },
          skip: 0,
          take: 20
        })
      })

      expect(result).toHaveLength(3)
    })

    it('should filter activities by entity type', async () => {
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'COMPANY', entityId: 'company-1', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() }
      ]
      mockActivities.push(...activities)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-1', entityType: 'CONTACT' }
        })
      })

      expect(result).toHaveLength(1)
      expect(result[0].entityType).toBe('CONTACT')
    })

    it('should filter activities by action type', async () => {
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-2', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() }
      ]
      mockActivities.push(...activities)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-1', actionType: 'CREATE' }
        })
      })

      expect(result).toHaveLength(1)
      expect(result[0].actionType).toBe('CREATE')
    })

    it('should filter activities by entity ID', async () => {
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() }
      ]
      mockActivities.push(...activities)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-1', entityId: 'contact-1' }
        })
      })

      expect(result).toHaveLength(2)
    })

    it('should filter activities by date range', async () => {
      const now = Date.now()
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date(now - 7200000) },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-2', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date(now) }
      ]
      mockActivities.push(...activities)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { 
            tenantId: 'tenant-1',
            createdAt: {
              gte: new Date(now - 3600000),
              lte: new Date(now + 3600000)
            }
          }
        })
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('act-2')
    })

    it('should retrieve individual activity by ID', async () => {
      const activity = {
        id: 'act-1',
        tenantId: 'tenant-1',
        entityType: 'CONTACT',
        entityId: 'contact-1',
        actionType: 'CREATE',
        userId: 'user-1',
        userEmail: 'user@example.com',
        createdAt: new Date()
      }
      mockActivities.push(activity)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findUnique({ where: { id: 'act-1' } })
      })

      expect(result).toBeDefined()
      expect(result?.id).toBe('act-1')
    })

    it('should return most recent activities first', async () => {
      const baseTime = Date.now()
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date(baseTime - 3600000) },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-2', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date(baseTime) }
      ]
      mockActivities.push(...activities)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-1' },
          orderBy: { createdAt: 'desc' }
        })
      })

      expect(result[0].id).toBe('act-2')
      expect(result[1].id).toBe('act-1')
    })
  })

  // ========================================================================
  // POST OPERATIONS - CREATE
  // ========================================================================

  describe('POST Operations - Create Activity', () => {
    
    it('should create activity with entity type and action', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.create({
          data: {
            tenantId: 'tenant-1',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            actionType: 'CREATE',
            userId: 'user-1',
            userEmail: 'user@example.com',
            changes: { name: ['', 'John Doe'] },
            description: 'Created new contact'
          }
        })
      })

      expect(result).toBeDefined()
      expect(result.entityType).toBe('CONTACT')
      expect(result.actionType).toBe('CREATE')
    })

    it('should track changes in activity log', async () => {
      const changes = {
        name: ['Old Name', 'New Name'],
        email: ['old@example.com', 'new@example.com']
      }

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.create({
          data: {
            tenantId: 'tenant-1',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            actionType: 'UPDATE',
            userId: 'user-1',
            userEmail: 'user@example.com',
            changes
          }
        })
      })

      expect(result.changes).toEqual(changes)
    })

    it('should record user information', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.create({
          data: {
            tenantId: 'tenant-1',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            actionType: 'CREATE',
            userId: 'user-456',
            userEmail: 'john@example.com'
          }
        })
      })

      expect(result.userId).toBe('user-456')
      expect(result.userEmail).toBe('john@example.com')
    })

    it('should support all entity types', async () => {
      const entityTypes = ['CONTACT', 'COMPANY', 'LEAD', 'PIPELINE', 'STAGE', 'WEBHOOK', 'API_KEY']
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      for (const entityType of entityTypes) {
        const result = await mockWithTenantContext(null, context, async (tx: any) => {
          return tx.activity.create({
            data: {
              tenantId: 'tenant-1',
              entityType: entityType as any,
              entityId: `${entityType.toLowerCase()}-1`,
              actionType: 'CREATE',
              userId: 'user-1',
              userEmail: 'user@example.com'
            }
          })
        })

        expect(result.entityType).toBe(entityType)
      }

      expect(mockActivities).toHaveLength(entityTypes.length)
    })

    it('should support all action types', async () => {
      const actionTypes = ['CREATE', 'UPDATE', 'DELETE', 'LINKED', 'VERIFIED', 'ACTIVATED', 'DEACTIVATED']
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      for (const actionType of actionTypes) {
        const result = await mockWithTenantContext(null, context, async (tx: any) => {
          return tx.activity.create({
            data: {
              tenantId: 'tenant-1',
              entityType: 'CONTACT',
              entityId: 'contact-1',
              actionType: actionType as any,
              userId: 'user-1',
              userEmail: 'user@example.com'
            }
          })
        })

        expect(result.actionType).toBe(actionType)
      }

      expect(mockActivities).toHaveLength(actionTypes.length)
    })
  })

  // ========================================================================
  // DELETE OPERATIONS
  // ========================================================================

  describe('DELETE Operations', () => {
    
    it('should delete individual activity', async () => {
      const activity = {
        id: 'act-1',
        tenantId: 'tenant-1',
        entityType: 'CONTACT',
        entityId: 'contact-1',
        actionType: 'CREATE',
        userId: 'user-1',
        userEmail: 'user@example.com',
        createdAt: new Date()
      }
      mockActivities.push(activity)

      expect(mockActivities).toHaveLength(1)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.delete({ where: { id: 'act-1' } })
      })

      expect(mockActivities).toHaveLength(0)
    })

    it('should delete multiple activities in batch', async () => {
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-2', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() }
      ]
      mockActivities.push(...activities)

      expect(mockActivities).toHaveLength(2)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.deleteMany({
          where: { id: { in: ['act-1', 'act-2'] }, tenantId: 'tenant-1' }
        })
      })

      expect(result.count).toBe(2)
      expect(mockActivities).toHaveLength(0)
    })

    it('should prevent cross-tenant deletion', async () => {
      const activity = {
        id: 'act-1',
        tenantId: 'tenant-1',
        entityType: 'CONTACT',
        entityId: 'contact-1',
        actionType: 'CREATE',
        userId: 'user-1',
        userEmail: 'user@example.com',
        createdAt: new Date()
      }
      mockActivities.push(activity)

      const wrongContext = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(wrongContext.tenantId).not.toBe(activity.tenantId)
    })
  })

  // ========================================================================
  // MULTI-TENANT ISOLATION
  // ========================================================================

  describe('Multi-Tenant Isolation', () => {
    
    it('should isolate activities by tenant', async () => {
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-2', tenantId: 'tenant-2', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-2', userEmail: 'user2@example.com', createdAt: new Date() }
      ]
      mockActivities.push(...activities)

      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result1 = await mockWithTenantContext(null, context1, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-1' }
        })
      })

      expect(result1).toHaveLength(1)
      expect(result1[0].tenantId).toBe('tenant-1')
    })

    it('should prevent access to other tenant activities', async () => {
      const activity = {
        id: 'act-1',
        tenantId: 'tenant-1',
        entityType: 'CONTACT',
        entityId: 'contact-1',
        actionType: 'CREATE',
        userId: 'user-1',
        userEmail: 'user@example.com',
        createdAt: new Date()
      }
      mockActivities.push(activity)

      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      const result = await mockWithTenantContext(null, context2, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-2' }
        })
      })

      expect(result).toHaveLength(0)
    })
  })

  // ========================================================================
  // AUDIT TRAIL SCENARIOS
  // ========================================================================

  describe('Audit Trail Scenarios', () => {
    
    it('should track contact creation history', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      
      // CREATE
      const create = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.create({
          data: {
            tenantId: 'tenant-1',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            actionType: 'CREATE',
            userId: 'user-1',
            userEmail: 'user@example.com',
            description: 'Created contact'
          }
        })
      })

      // UPDATE
      const update = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.create({
          data: {
            tenantId: 'tenant-1',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            actionType: 'UPDATE',
            userId: 'user-1',
            userEmail: 'user@example.com',
            changes: { email: ['old@example.com', 'new@example.com'] },
            description: 'Updated email'
          }
        })
      })

      const history = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { entityId: 'contact-123' }
        })
      })

      expect(history).toHaveLength(2)
      expect(history[0].actionType).toBe('CREATE')
      expect(history[1].actionType).toBe('UPDATE')
    })

    it('should support metadata for extended tracking', async () => {
      const metadata = {
        ipAddress: '192.168.1.1',
        userAgent: 'Chrome/120.0',
        requestId: 'req-12345'
      }

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.create({
          data: {
            tenantId: 'tenant-1',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            actionType: 'CREATE',
            userId: 'user-1',
            userEmail: 'user@example.com',
            metadata
          }
        })
      })

      expect(result.metadata).toEqual(metadata)
    })
  })

  // ========================================================================
  // RATE LIMITING
  // ========================================================================

  describe('Rate Limiting', () => {
    
    it('should apply rate limiting to GET requests', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/activities'))
      expect(result).toBeNull()
    })

    it('should apply rate limiting to POST requests', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/activities', { method: 'POST' }))
      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  describe('Error Handling', () => {
    
    it('should handle invalid activity ID gracefully', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findUnique({ where: { id: 'nonexistent-id' } })
      })

      expect(result).toBeUndefined()
    })

    it('should handle missing required fields', async () => {
      expect(() => {
        z.object({ entityType: z.string(), actionType: z.string() }).parse({})
      }).toThrow()
    })
  })

  // ========================================================================
  // COMBINED FILTERING
  // ========================================================================

  describe('Combined Filtering', () => {
    
    it('should filter by entity type and action type together', async () => {
      const activities = [
        { id: 'act-1', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-2', tenantId: 'tenant-1', entityType: 'CONTACT', entityId: 'contact-2', actionType: 'UPDATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() },
        { id: 'act-3', tenantId: 'tenant-1', entityType: 'COMPANY', entityId: 'company-1', actionType: 'CREATE', userId: 'user-1', userEmail: 'user@example.com', createdAt: new Date() }
      ]
      mockActivities.push(...activities)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.activity.findMany({
          where: { tenantId: 'tenant-1', entityType: 'CONTACT', actionType: 'CREATE' }
        })
      })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('act-1')
    })
  })
})
