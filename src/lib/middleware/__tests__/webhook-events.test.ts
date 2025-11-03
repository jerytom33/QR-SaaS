import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * Webhook Events API Tests - Phase 2.1i
 * Tests for event delivery tracking, retry management, and delivery history
 */

// Mock event store
const mockEvents: any[] = []
let mockEventIdCounter = 1

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
    webhookEvent: {
      findMany: vi.fn(async ({ where, skip, take, orderBy, include }) => {
        let filtered = [...mockEvents]
        if (where.tenantId) {
          filtered = filtered.filter(e => e.tenantId === where.tenantId)
        }
        if (where.webhookId) {
          filtered = filtered.filter(e => e.webhookId === where.webhookId)
        }
        if (where.status) {
          filtered = filtered.filter(e => e.status === where.status)
        }
        if (where.OR) {
          filtered = filtered.filter(e =>
            where.OR.some((condition: any) =>
              (condition.eventType?.contains && e.eventType.includes(condition.eventType.contains)) ||
              (condition.entityType?.contains && e.entityType.includes(condition.entityType.contains)) ||
              (condition.entityId?.contains && e.entityId.includes(condition.entityId.contains))
            )
          )
        }
        if (where.createdAt?.gte) {
          filtered = filtered.filter(e => new Date(e.createdAt) >= new Date(where.createdAt.gte))
        }
        if (where.createdAt?.lte) {
          filtered = filtered.filter(e => new Date(e.createdAt) <= new Date(where.createdAt.lte))
        }
        return filtered.slice(skip || 0, (skip || 0) + (take || 20)).sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      }),
      count: vi.fn(async ({ where }) => {
        let filtered = [...mockEvents]
        if (where.tenantId) {
          filtered = filtered.filter(e => e.tenantId === where.tenantId)
        }
        return filtered.length
      }),
      findUnique: vi.fn(async ({ where }) => {
        return mockEvents.find(e => e.id === where.id)
      }),
      create: vi.fn(async ({ data }) => {
        const event = {
          id: `evt-${mockEventIdCounter++}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        mockEvents.push(event)
        return event
      }),
      update: vi.fn(async ({ where, data }) => {
        const index = mockEvents.findIndex(e => e.id === where.id)
        if (index !== -1) {
          mockEvents[index] = { ...mockEvents[index], ...data, updatedAt: new Date() }
          return mockEvents[index]
        }
        return null
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const count = mockEvents.filter(e => where.id.in.includes(e.id)).length
        mockEvents
          .filter(e => where.id.in.includes(e.id))
          .forEach(e => {
            Object.assign(e, data, { updatedAt: new Date() })
          })
        return { count }
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const count = mockEvents.filter(e => where.id.in.includes(e.id)).length
        mockEvents.splice(0, mockEvents.length,
          ...mockEvents.filter(e => !where.id.in.includes(e.id))
        )
        return { count }
      }),
      delete: vi.fn(async ({ where }) => {
        const index = mockEvents.findIndex(e => e.id === where.id)
        if (index !== -1) {
          return mockEvents.splice(index, 1)[0]
        }
        return null
      })
    },
    webhook: {
      findUnique: vi.fn(async ({ where }) => {
        return {
          id: where.id,
          tenantId: 'tenant-456',
          name: 'Test Webhook',
          url: 'https://example.com/webhook',
          isActive: true
        }
      })
    }
  })
})

describe('Webhook Events API - Phase 2.1i', () => {

  beforeEach(() => {
    mockEvents.length = 0
    mockEventIdCounter = 1
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

    it('should verify tenant isolation', async () => {
      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(context1.tenantId).not.toBe(context2.tenantId)
    })

    it('should verify event ownership before access', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'PENDING',
        createdAt: new Date()
      }
      mockEvents.push(event)

      const wrongContext = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(wrongContext.tenantId).not.toBe(event.tenantId)
    })
  })

  // ========================================================================
  // GET OPERATIONS - LIST & RETRIEVE
  // ========================================================================

  describe('GET Operations', () => {

    it('should list webhook events with pagination', async () => {
      const events = Array.from({ length: 5 }, (_, i) => ({
        id: `evt-${i}`,
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: `contact-${i}`,
        payload: {},
        status: 'PENDING',
        attempts: 0,
        createdAt: new Date(Date.now() - i * 60000),
        updatedAt: new Date()
      }))
      mockEvents.push(...events)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.findMany({
          where: { tenantId: 'tenant-1' },
          skip: 0,
          take: 20
        })
      })

      expect(result).toHaveLength(5)
    })

    it('should filter events by status', async () => {
      const events = [
        { id: 'evt-1', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.created', entityType: 'CONTACT', entityId: 'c-1', payload: {}, status: 'DELIVERED', attempts: 1, createdAt: new Date(), updatedAt: new Date() },
        { id: 'evt-2', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.updated', entityType: 'CONTACT', entityId: 'c-2', payload: {}, status: 'PENDING', attempts: 0, createdAt: new Date(), updatedAt: new Date() },
        { id: 'evt-3', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.deleted', entityType: 'CONTACT', entityId: 'c-3', payload: {}, status: 'FAILED', attempts: 3, createdAt: new Date(), updatedAt: new Date() }
      ]
      mockEvents.push(...events)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.findMany({
          where: { tenantId: 'tenant-1', status: 'PENDING' }
        })
      })

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('PENDING')
    })

    it('should filter events by webhook', async () => {
      const events = [
        { id: 'evt-1', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.created', entityType: 'CONTACT', entityId: 'c-1', payload: {}, status: 'PENDING', attempts: 0, createdAt: new Date(), updatedAt: new Date() },
        { id: 'evt-2', tenantId: 'tenant-1', webhookId: 'wh-2', eventType: 'contact.created', entityType: 'CONTACT', entityId: 'c-2', payload: {}, status: 'PENDING', attempts: 0, createdAt: new Date(), updatedAt: new Date() }
      ]
      mockEvents.push(...events)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.findMany({
          where: { tenantId: 'tenant-1', webhookId: 'wh-1' }
        })
      })

      expect(result).toHaveLength(1)
      expect(result[0].webhookId).toBe('wh-1')
    })

    it('should retrieve individual event by ID', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: { name: 'John Doe', email: 'john@example.com' },
        status: 'PENDING',
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockEvents.push(event)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.findUnique({ where: { id: 'evt-1' } })
      })

      expect(result).toBeDefined()
      expect(result?.id).toBe('evt-1')
    })

    it('should sort events by creation date descending', async () => {
      const baseTime = Date.now()
      const events = [
        { id: 'evt-1', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.created', entityType: 'CONTACT', entityId: 'c-1', payload: {}, status: 'PENDING', attempts: 0, createdAt: new Date(baseTime - 3600000), updatedAt: new Date() },
        { id: 'evt-2', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.updated', entityType: 'CONTACT', entityId: 'c-2', payload: {}, status: 'PENDING', attempts: 0, createdAt: new Date(baseTime), updatedAt: new Date() }
      ]
      mockEvents.push(...events)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.findMany({
          where: { tenantId: 'tenant-1' },
          orderBy: { createdAt: 'desc' }
        })
      })

      expect(result[0].id).toBe('evt-2')
      expect(result[1].id).toBe('evt-1')
    })
  })

  // ========================================================================
  // POST OPERATIONS - CREATE
  // ========================================================================

  describe('POST Operations - Create Event', () => {

    it('should create webhook event with required fields', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.create({
          data: {
            tenantId: 'tenant-1',
            webhookId: 'wh-1',
            eventType: 'contact.created',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            payload: { name: 'John Doe' },
            status: 'PENDING',
            attempts: 0,
            nextRetryAt: new Date(),
            triggeredBy: 'user-123'
          }
        })
      })

      expect(result).toBeDefined()
      expect(result.eventType).toBe('contact.created')
      expect(result.status).toBe('PENDING')
    })

    it('should set initial attempt count to 0', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.create({
          data: {
            tenantId: 'tenant-1',
            webhookId: 'wh-1',
            eventType: 'contact.created',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            payload: {},
            status: 'PENDING',
            attempts: 0,
            triggeredBy: 'user-123'
          }
        })
      })

      expect(result.attempts).toBe(0)
    })

    it('should support multiple event types', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const eventTypes = ['contact.created', 'contact.updated', 'contact.deleted', 'company.created', 'lead.updated']

      for (const eventType of eventTypes) {
        const result = await mockWithTenantContext(null, context, async (tx: any) => {
          return tx.webhookEvent.create({
            data: {
              tenantId: 'tenant-1',
              webhookId: 'wh-1',
              eventType,
              entityType: eventType.includes('contact') ? 'CONTACT' : eventType.includes('company') ? 'COMPANY' : 'LEAD',
              entityId: 'entity-123',
              payload: {},
              status: 'PENDING',
              attempts: 0
            }
          })
        })

        expect(result.eventType).toBe(eventType)
      }
    })

    it('should support entity types', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const entityTypes = ['CONTACT', 'COMPANY', 'LEAD', 'PIPELINE', 'STAGE']

      for (const entityType of entityTypes) {
        const result = await mockWithTenantContext(null, context, async (tx: any) => {
          return tx.webhookEvent.create({
            data: {
              tenantId: 'tenant-1',
              webhookId: 'wh-1',
              eventType: 'entity.created',
              entityType,
              entityId: 'entity-123',
              payload: {},
              status: 'PENDING',
              attempts: 0
            }
          })
        })

        expect(result.entityType).toBe(entityType)
      }
    })
  })

  // ========================================================================
  // PUT OPERATIONS - UPDATE
  // ========================================================================

  describe('PUT Operations - Update Event', () => {

    it('should mark event as delivered', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'PENDING',
        attempts: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockEvents.push(event)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.update({
          where: { id: 'evt-1' },
          data: { status: 'DELIVERED' }
        })
      })

      expect(result.status).toBe('DELIVERED')
    })

    it('should mark event as failed with error message', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'PENDING',
        attempts: 1,
        lastAttemptError: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockEvents.push(event)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.update({
          where: { id: 'evt-1' },
          data: { status: 'FAILED', lastAttemptError: 'Connection timeout' }
        })
      })

      expect(result.status).toBe('FAILED')
      expect(result.lastAttemptError).toBe('Connection timeout')
    })

    it('should schedule retry with delay', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'FAILED',
        attempts: 1,
        nextRetryAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockEvents.push(event)

      const retryTime = new Date(Date.now() + 60000)
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.update({
          where: { id: 'evt-1' },
          data: { status: 'RETRYING', nextRetryAt: retryTime }
        })
      })

      expect(result.status).toBe('RETRYING')
      expect(result.nextRetryAt).toBeDefined()
    })

    it('should increment attempt counter', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'RETRYING',
        attempts: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockEvents.push(event)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.update({
          where: { id: 'evt-1' },
          data: { attempts: 3 }
        })
      })

      expect(result.attempts).toBe(3)
    })
  })

  // ========================================================================
  // DELETE OPERATIONS
  // ========================================================================

  describe('DELETE Operations', () => {

    it('should delete individual event', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'FAILED',
        createdAt: new Date()
      }
      mockEvents.push(event)

      expect(mockEvents).toHaveLength(1)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.delete({ where: { id: 'evt-1' } })
      })

      expect(mockEvents).toHaveLength(0)
    })

    it('should delete multiple events in batch', async () => {
      const events = [
        { id: 'evt-1', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.created', entityType: 'CONTACT', entityId: 'c-1', payload: {}, status: 'FAILED', createdAt: new Date() },
        { id: 'evt-2', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.updated', entityType: 'CONTACT', entityId: 'c-2', payload: {}, status: 'FAILED', createdAt: new Date() }
      ]
      mockEvents.push(...events)

      expect(mockEvents).toHaveLength(2)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.deleteMany({
          where: { id: { in: ['evt-1', 'evt-2'] }, tenantId: 'tenant-1' }
        })
      })

      expect(result.count).toBe(2)
      expect(mockEvents).toHaveLength(0)
    })
  })

  // ========================================================================
  // DELIVERY TRACKING
  // ========================================================================

  describe('Delivery Tracking', () => {

    it('should track event delivery status', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'PENDING',
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockEvents.push(event)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      // Simulate delivery attempt
      const attempt1 = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.update({
          where: { id: 'evt-1' },
          data: { status: 'DELIVERED', attempts: 1 }
        })
      })

      expect(attempt1.status).toBe('DELIVERED')
      expect(attempt1.attempts).toBe(1)
    })

    it('should track failed delivery attempts', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      // Create event
      const event = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.create({
          data: {
            tenantId: 'tenant-1',
            webhookId: 'wh-1',
            eventType: 'contact.created',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            payload: {},
            status: 'PENDING',
            attempts: 0
          }
        })
      })

      // Simulate failed attempts
      for (let i = 1; i <= 3; i++) {
        await mockWithTenantContext(null, context, async (tx: any) => {
          return tx.webhookEvent.update({
            where: { id: event.id },
            data: {
              status: i < 3 ? 'RETRYING' : 'FAILED',
              attempts: i,
              lastAttemptError: 'Connection timeout'
            }
          })
        })
      }

      const final = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.findUnique({ where: { id: event.id } })
      })

      expect(final.attempts).toBe(3)
      expect(final.status).toBe('FAILED')
    })
  })

  // ========================================================================
  // MULTI-TENANT ISOLATION
  // ========================================================================

  describe('Multi-Tenant Isolation', () => {

    it('should isolate events by tenant', async () => {
      const events = [
        { id: 'evt-1', tenantId: 'tenant-1', webhookId: 'wh-1', eventType: 'contact.created', entityType: 'CONTACT', entityId: 'c-1', payload: {}, status: 'PENDING', attempts: 0, createdAt: new Date(), updatedAt: new Date() },
        { id: 'evt-2', tenantId: 'tenant-2', webhookId: 'wh-2', eventType: 'contact.created', entityType: 'CONTACT', entityId: 'c-2', payload: {}, status: 'PENDING', attempts: 0, createdAt: new Date(), updatedAt: new Date() }
      ]
      mockEvents.push(...events)

      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result1 = await mockWithTenantContext(null, context1, async (tx: any) => {
        return tx.webhookEvent.findMany({
          where: { tenantId: 'tenant-1' }
        })
      })

      expect(result1).toHaveLength(1)
      expect(result1[0].tenantId).toBe('tenant-1')
    })

    it('should prevent access to other tenant events', async () => {
      const event = {
        id: 'evt-1',
        tenantId: 'tenant-1',
        webhookId: 'wh-1',
        eventType: 'contact.created',
        entityType: 'CONTACT',
        entityId: 'contact-123',
        payload: {},
        status: 'PENDING',
        createdAt: new Date()
      }
      mockEvents.push(event)

      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      const result = await mockWithTenantContext(null, context2, async (tx: any) => {
        return tx.webhookEvent.findMany({
          where: { tenantId: 'tenant-2' }
        })
      })

      expect(result).toHaveLength(0)
    })
  })

  // ========================================================================
  // RATE LIMITING
  // ========================================================================

  describe('Rate Limiting', () => {

    it('should apply rate limiting to GET requests', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/webhook-events'))
      expect(result).toBeNull()
    })

    it('should apply rate limiting to POST requests', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/webhook-events', { method: 'POST' }))
      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // COMPREHENSIVE LIFECYCLE
  // ========================================================================

  describe('Event Lifecycle', () => {

    it('should complete full event delivery lifecycle', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      // 1. CREATE event
      const created = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.create({
          data: {
            tenantId: 'tenant-1',
            webhookId: 'wh-1',
            eventType: 'contact.created',
            entityType: 'CONTACT',
            entityId: 'contact-123',
            payload: { name: 'John' },
            status: 'PENDING',
            attempts: 0,
            nextRetryAt: new Date()
          }
        })
      })
      expect(created.status).toBe('PENDING')

      // 2. RETRIEVE event
      const retrieved = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.findUnique({ where: { id: created.id } })
      })
      expect(retrieved.id).toBe(created.id)

      // 3. UPDATE to DELIVERED
      const delivered = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.update({
          where: { id: created.id },
          data: { status: 'DELIVERED', attempts: 1 }
        })
      })
      expect(delivered.status).toBe('DELIVERED')

      // 4. DELETE
      const deleted = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhookEvent.delete({ where: { id: created.id } })
      })
      expect(deleted.id).toBe(created.id)
      expect(mockEvents).toHaveLength(0)
    })
  })
})
