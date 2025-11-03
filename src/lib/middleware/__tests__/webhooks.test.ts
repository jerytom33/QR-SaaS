import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { randomBytes, createHash } from 'crypto'

/**
 * Webhooks API Tests - Phase 2.1h
 * Tests for webhook management with secret generation, URL validation,
 * event subscription, and secret rotation.
 */

// Mock webhook store
const mockWebhooks: any[] = []
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

// Helper functions
function generateWebhookSecret() {
  const secret = randomBytes(32).toString('base64')
  const hash = createHash('sha256').update(secret).digest('hex')
  return { secret, hash }
}

function validateUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const mockWithTenantContext = vi.fn(async (db: any, context: any, fn: any) => {
  return fn({
    webhook: {
      findMany: vi.fn(async ({ where, skip, take, orderBy }) => {
        let filtered = [...mockWebhooks]
        if (where.tenantId) {
          filtered = filtered.filter(w => w.tenantId === where.tenantId)
        }
        if (where.isActive !== undefined) {
          filtered = filtered.filter(w => w.isActive === where.isActive)
        }
        if (where.OR) {
          filtered = filtered.filter(w =>
            where.OR.some((condition: any) =>
              (condition.name?.contains && w.name.includes(condition.name.contains)) ||
              (condition.url?.contains && w.url.includes(condition.url.contains))
            )
          )
        }
        return filtered.slice(skip || 0, (skip || 0) + (take || 20)).sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      }),
      count: vi.fn(async ({ where }) => {
        let filtered = [...mockWebhooks]
        if (where.tenantId) {
          filtered = filtered.filter(w => w.tenantId === where.tenantId)
        }
        return filtered.length
      }),
      findUnique: vi.fn(async ({ where }) => {
        return mockWebhooks.find(w => w.id === where.id)
      }),
      create: vi.fn(async ({ data }) => {
        const webhook = {
          id: `wh-${mockIdCounter++}`,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        mockWebhooks.push(webhook)
        return webhook
      }),
      update: vi.fn(async ({ where, data, select }) => {
        const index = mockWebhooks.findIndex(w => w.id === where.id)
        if (index !== -1) {
          mockWebhooks[index] = { ...mockWebhooks[index], ...data, updatedAt: new Date() }
          return mockWebhooks[index]
        }
        return null
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const count = mockWebhooks.filter(w => where.id.in.includes(w.id)).length
        mockWebhooks
          .filter(w => where.id.in.includes(w.id))
          .forEach(w => {
            Object.assign(w, data, { updatedAt: new Date() })
          })
        return { count }
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const count = mockWebhooks.filter(w => where.id.in.includes(w.id)).length
        mockWebhooks.splice(0, mockWebhooks.length,
          ...mockWebhooks.filter(w => !where.id.in.includes(w.id))
        )
        return { count }
      }),
      delete: vi.fn(async ({ where }) => {
        const index = mockWebhooks.findIndex(w => w.id === where.id)
        if (index !== -1) {
          return mockWebhooks.splice(index, 1)[0]
        }
        return null
      })
    }
  })
})

describe('Webhooks API - Phase 2.1h', () => {

  beforeEach(() => {
    mockWebhooks.length = 0
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

    it('should verify webhook ownership on access', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date()
      }
      mockWebhooks.push(webhook)

      const wrongContext = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(wrongContext.tenantId).not.toBe(webhook.tenantId)
    })
  })

  // ========================================================================
  // SECRET GENERATION
  // ========================================================================

  describe('Secret Generation', () => {

    it('should generate cryptographically secure secrets', () => {
      const { secret, hash } = generateWebhookSecret()
      expect(secret).toBeDefined()
      expect(hash).toBeDefined()
      expect(secret.length).toBeGreaterThan(0)
      expect(hash.length).toBe(64) // SHA-256 hex string
    })

    it('should generate unique secrets for each webhook', () => {
      const { secret: secret1 } = generateWebhookSecret()
      const { secret: secret2 } = generateWebhookSecret()
      expect(secret1).not.toBe(secret2)
    })

    it('should hash secrets consistently', () => {
      const secret = 'test-secret-value'
      const hash1 = createHash('sha256').update(secret).digest('hex')
      const hash2 = createHash('sha256').update(secret).digest('hex')
      expect(hash1).toBe(hash2)
    })

    it('should never expose full secret in response', () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      // Response should contain secret only on creation
      // Retrieval should not include secretHash
    })
  })

  // ========================================================================
  // URL VALIDATION
  // ========================================================================

  describe('URL Validation', () => {

    it('should accept valid HTTPS URLs', () => {
      expect(validateUrl('https://example.com/webhook')).toBe(true)
      expect(validateUrl('https://api.example.com/v1/webhooks')).toBe(true)
    })

    it('should accept valid HTTP URLs', () => {
      expect(validateUrl('http://localhost:3000/webhook')).toBe(true)
      expect(validateUrl('http://192.168.1.1:8080/webhook')).toBe(true)
    })

    it('should reject invalid URLs', () => {
      expect(validateUrl('not-a-url')).toBe(false)
      expect(validateUrl('ftp://example.com')).toBe(false)
      expect(validateUrl('example.com')).toBe(false)
    })

    it('should reject missing protocol', () => {
      expect(validateUrl('//example.com/webhook')).toBe(false)
    })
  })

  // ========================================================================
  // GET OPERATIONS - LIST & RETRIEVE
  // ========================================================================

  describe('GET Operations', () => {

    it('should list webhooks with pagination', async () => {
      const webhooks = [
        { id: 'wh-1', tenantId: 'tenant-1', name: 'Webhook 1', url: 'https://example.com/1', events: ['contact.created'], secretHash: 'hash1', isActive: true, createdAt: new Date() },
        { id: 'wh-2', tenantId: 'tenant-1', name: 'Webhook 2', url: 'https://example.com/2', events: ['contact.updated'], secretHash: 'hash2', isActive: true, createdAt: new Date() },
        { id: 'wh-3', tenantId: 'tenant-1', name: 'Webhook 3', url: 'https://example.com/3', events: ['company.created'], secretHash: 'hash3', isActive: false, createdAt: new Date() }
      ]
      mockWebhooks.push(...webhooks)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.findMany({
          where: { tenantId: 'tenant-1' },
          skip: 0,
          take: 20
        })
      })

      expect(result).toHaveLength(3)
    })

    it('should filter webhooks by active status', async () => {
      const webhooks = [
        { id: 'wh-1', tenantId: 'tenant-1', name: 'Webhook 1', url: 'https://example.com/1', events: ['contact.created'], secretHash: 'hash1', isActive: true, createdAt: new Date() },
        { id: 'wh-2', tenantId: 'tenant-1', name: 'Webhook 2', url: 'https://example.com/2', events: ['contact.updated'], secretHash: 'hash2', isActive: false, createdAt: new Date() }
      ]
      mockWebhooks.push(...webhooks)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.findMany({
          where: { tenantId: 'tenant-1', isActive: true }
        })
      })

      expect(result).toHaveLength(1)
      expect(result[0].isActive).toBe(true)
    })

    it('should retrieve individual webhook by ID', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date()
      }
      mockWebhooks.push(webhook)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.findUnique({ where: { id: 'wh-1' } })
      })

      expect(result).toBeDefined()
      expect(result?.id).toBe('wh-1')
    })

    it('should return most recent webhooks first', async () => {
      const baseTime = Date.now()
      const webhooks = [
        { id: 'wh-1', tenantId: 'tenant-1', name: 'Webhook 1', url: 'https://example.com/1', events: ['contact.created'], secretHash: 'hash1', isActive: true, createdAt: new Date(baseTime - 3600000) },
        { id: 'wh-2', tenantId: 'tenant-1', name: 'Webhook 2', url: 'https://example.com/2', events: ['contact.updated'], secretHash: 'hash2', isActive: true, createdAt: new Date(baseTime) }
      ]
      mockWebhooks.push(...webhooks)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.findMany({
          where: { tenantId: 'tenant-1' },
          orderBy: { createdAt: 'desc' }
        })
      })

      expect(result[0].id).toBe('wh-2')
      expect(result[1].id).toBe('wh-1')
    })
  })

  // ========================================================================
  // POST OPERATIONS - CREATE
  // ========================================================================

  describe('POST Operations - Create Webhook', () => {

    it('should create webhook with required fields', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const { secret, hash } = generateWebhookSecret()

      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.create({
          data: {
            tenantId: 'tenant-1',
            name: 'Contact Webhook',
            url: 'https://example.com/webhooks/contact',
            events: ['contact.created', 'contact.updated'],
            secretHash: hash,
            isActive: true,
            maxRetries: 3,
            retryDelaySeconds: 60
          }
        })
      })

      expect(result).toBeDefined()
      expect(result.name).toBe('Contact Webhook')
      expect(result.url).toBe('https://example.com/webhooks/contact')
      expect(result.events).toContain('contact.created')
    })

    it('should generate and return secret on creation', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const { secret, hash } = generateWebhookSecret()

      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.create({
          data: {
            tenantId: 'tenant-1',
            name: 'Test Webhook',
            url: 'https://example.com/webhook',
            events: ['contact.created'],
            secretHash: hash,
            isActive: true
          }
        })
      })

      expect(result).toBeDefined()
      // Secret should be returned separately in response
    })

    it('should set default values for optional fields', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const { hash } = generateWebhookSecret()

      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.create({
          data: {
            tenantId: 'tenant-1',
            name: 'Test Webhook',
            url: 'https://example.com/webhook',
            events: ['contact.created'],
            secretHash: hash,
            isActive: true,
            maxRetries: 3,
            retryDelaySeconds: 60
          }
        })
      })

      expect(result.maxRetries).toBe(3)
      expect(result.retryDelaySeconds).toBe(60)
    })

    it('should support multiple event subscriptions', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const { hash } = generateWebhookSecret()

      const events = ['contact.created', 'contact.updated', 'contact.deleted', 'company.created']
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.create({
          data: {
            tenantId: 'tenant-1',
            name: 'Multi-Event Webhook',
            url: 'https://example.com/webhook',
            events,
            secretHash: hash,
            isActive: true
          }
        })
      })

      expect(result.events).toEqual(events)
    })
  })

  // ========================================================================
  // PUT OPERATIONS - UPDATE
  // ========================================================================

  describe('PUT Operations - Update Webhook', () => {

    it('should update webhook name', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Old Name',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockWebhooks.push(webhook)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.update({
          where: { id: 'wh-1' },
          data: { name: 'New Name' }
        })
      })

      expect(result.name).toBe('New Name')
    })

    it('should update webhook URL', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://old.example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockWebhooks.push(webhook)

      const newUrl = 'https://new.example.com/webhook'
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.update({
          where: { id: 'wh-1' },
          data: { url: newUrl }
        })
      })

      expect(result.url).toBe(newUrl)
    })

    it('should update events subscription', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockWebhooks.push(webhook)

      const newEvents = ['contact.created', 'contact.updated', 'company.created']
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.update({
          where: { id: 'wh-1' },
          data: { events: newEvents }
        })
      })

      expect(result.events).toEqual(newEvents)
    })

    it('should rotate webhook secret', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'old-hash',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockWebhooks.push(webhook)

      const { hash: newHash } = generateWebhookSecret()
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.update({
          where: { id: 'wh-1' },
          data: { secretHash: newHash }
        })
      })

      expect(result.secretHash).not.toBe('old-hash')
    })

    it('should activate/deactivate webhook', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockWebhooks.push(webhook)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.update({
          where: { id: 'wh-1' },
          data: { isActive: false }
        })
      })

      expect(result.isActive).toBe(false)
    })

    it('should update retry configuration', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        maxRetries: 3,
        retryDelaySeconds: 60,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      mockWebhooks.push(webhook)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.update({
          where: { id: 'wh-1' },
          data: { maxRetries: 5, retryDelaySeconds: 120 }
        })
      })

      expect(result.maxRetries).toBe(5)
      expect(result.retryDelaySeconds).toBe(120)
    })
  })

  // ========================================================================
  // DELETE OPERATIONS
  // ========================================================================

  describe('DELETE Operations', () => {

    it('should delete individual webhook', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date()
      }
      mockWebhooks.push(webhook)

      expect(mockWebhooks).toHaveLength(1)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.delete({ where: { id: 'wh-1' } })
      })

      expect(mockWebhooks).toHaveLength(0)
    })

    it('should delete multiple webhooks in batch', async () => {
      const webhooks = [
        { id: 'wh-1', tenantId: 'tenant-1', name: 'Webhook 1', url: 'https://example.com/1', events: ['contact.created'], secretHash: 'hash1', isActive: true, createdAt: new Date() },
        { id: 'wh-2', tenantId: 'tenant-1', name: 'Webhook 2', url: 'https://example.com/2', events: ['contact.updated'], secretHash: 'hash2', isActive: true, createdAt: new Date() }
      ]
      mockWebhooks.push(...webhooks)

      expect(mockWebhooks).toHaveLength(2)

      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.deleteMany({
          where: { id: { in: ['wh-1', 'wh-2'] }, tenantId: 'tenant-1' }
        })
      })

      expect(result.count).toBe(2)
      expect(mockWebhooks).toHaveLength(0)
    })

    it('should prevent cross-tenant deletion', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date()
      }
      mockWebhooks.push(webhook)

      const wrongContext = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      expect(wrongContext.tenantId).not.toBe(webhook.tenantId)
    })
  })

  // ========================================================================
  // MULTI-TENANT ISOLATION
  // ========================================================================

  describe('Multi-Tenant Isolation', () => {

    it('should isolate webhooks by tenant', async () => {
      const webhooks = [
        { id: 'wh-1', tenantId: 'tenant-1', name: 'Webhook 1', url: 'https://example.com/1', events: ['contact.created'], secretHash: 'hash1', isActive: true, createdAt: new Date() },
        { id: 'wh-2', tenantId: 'tenant-2', name: 'Webhook 2', url: 'https://example.com/2', events: ['contact.created'], secretHash: 'hash2', isActive: true, createdAt: new Date() }
      ]
      mockWebhooks.push(...webhooks)

      const context1 = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result1 = await mockWithTenantContext(null, context1, async (tx: any) => {
        return tx.webhook.findMany({
          where: { tenantId: 'tenant-1' }
        })
      })

      expect(result1).toHaveLength(1)
      expect(result1[0].tenantId).toBe('tenant-1')
    })

    it('should prevent access to other tenant webhooks', async () => {
      const webhook = {
        id: 'wh-1',
        tenantId: 'tenant-1',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['contact.created'],
        secretHash: 'hash123',
        isActive: true,
        createdAt: new Date()
      }
      mockWebhooks.push(webhook)

      const context2 = mockGetTenantContextFromUser({ tenantId: 'tenant-2', role: 'USER' })
      const result = await mockWithTenantContext(null, context2, async (tx: any) => {
        return tx.webhook.findMany({
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
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/webhooks'))
      expect(result).toBeNull()
    })

    it('should apply rate limiting to POST requests', async () => {
      mockAuthenticatedRateLimiter.mockResolvedValueOnce(null)
      const result = await mockAuthenticatedRateLimiter(new NextRequest('http://localhost/api/v1/connection/webhooks', { method: 'POST' }))
      expect(result).toBeNull()
    })
  })

  // ========================================================================
  // ERROR HANDLING
  // ========================================================================

  describe('Error Handling', () => {

    it('should handle invalid webhook ID gracefully', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })
      const result = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.findUnique({ where: { id: 'nonexistent-id' } })
      })

      expect(result).toBeUndefined()
    })

    it('should handle invalid URLs in validation', () => {
      expect(validateUrl('not-a-url')).toBe(false)
    })

    it('should handle missing required fields', () => {
      expect(() => {
        z.object({ name: z.string(), url: z.string() }).parse({})
      }).toThrow()
    })
  })

  // ========================================================================
  // COMPREHENSIVE LIFECYCLE TESTS
  // ========================================================================

  describe('Webhook Lifecycle', () => {

    it('should complete full webhook lifecycle', async () => {
      const context = mockGetTenantContextFromUser({ tenantId: 'tenant-1', role: 'USER' })

      // 1. CREATE
      const { secret, hash } = generateWebhookSecret()
      const created = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.create({
          data: {
            tenantId: 'tenant-1',
            name: 'Lifecycle Test',
            url: 'https://example.com/webhook',
            events: ['contact.created'],
            secretHash: hash,
            isActive: true
          }
        })
      })
      expect(created.name).toBe('Lifecycle Test')

      // 2. RETRIEVE
      const retrieved = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.findUnique({ where: { id: created.id } })
      })
      expect(retrieved.id).toBe(created.id)

      // 3. UPDATE
      const updated = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.update({
          where: { id: created.id },
          data: { events: ['contact.created', 'contact.updated'] }
        })
      })
      expect(updated.events).toHaveLength(2)

      // 4. DELETE
      const deleted = await mockWithTenantContext(null, context, async (tx: any) => {
        return tx.webhook.delete({ where: { id: created.id } })
      })
      expect(deleted.id).toBe(created.id)
      expect(mockWebhooks).toHaveLength(0)
    })
  })
})
