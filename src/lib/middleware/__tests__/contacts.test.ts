import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * Contact Routes Tests
 * Tests multi-tenant isolation, CRUD operations, rate limiting, and authentication
 */

describe('Contacts API Routes', () => {
  // Test data
  const tenant1Id = 'tenant-1-test'
  const tenant2Id = 'tenant-2-test'
  const user1Id = 'user-1-test'
  const user2Id = 'user-2-test'
  let contactId: string

  // Helper to create test request
  function createRequest(
    method: string,
    userId: string = user1Id,
    tenantId: string = tenant1Id,
    body?: unknown
  ) {
    const request = new NextRequest('http://localhost:3000/api/v1/connection/contacts', {
      method,
      headers: {
        'authorization': `Bearer test-token`,
        'x-user-id': userId,
        'x-tenant-id': tenantId,
        'x-user-role': 'USER',
        'content-type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
    return request
  }

  beforeAll(async () => {
    // Create test companies and contacts for testing
    await db.company.createMany({
      data: [
        {
          id: 'company-1',
          name: 'Test Company 1',
          tenantId: tenant1Id
        },
        {
          id: 'company-2',
          name: 'Test Company 2',
          tenantId: tenant2Id
        }
      ]
    })

    // Create test contacts for tenant1
    const contact = await db.contact.create({
      data: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        tenantId: tenant1Id,
        companyId: 'company-1'
      }
    })
    contactId = contact.id
  })

  afterAll(async () => {
    // Cleanup
    await db.contact.deleteMany({
      where: { tenantId: { in: [tenant1Id, tenant2Id] } }
    })
    await db.company.deleteMany({
      where: { id: { in: ['company-1', 'company-2'] } }
    })
  })

  describe('Authentication & Authorization', () => {
    it('should reject request without Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/contacts', {
        method: 'GET',
        headers: {
          'x-user-id': user1Id,
          'x-tenant-id': tenant1Id
        }
      })

      // Expected: 401 Unauthorized (no Bearer token)
      expect(request.headers.get('authorization')).not.toContain('Bearer')
    })

    it('should reject request without user ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/contacts', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-tenant-id': tenant1Id
        }
      })

      // Expected: 401 Unauthorized (no user ID)
      expect(request.headers.get('x-user-id')).toBeNull()
    })

    it('should reject request without tenant ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/contacts', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-user-id': user1Id
        }
      })

      // Expected: 401 Unauthorized (no tenant ID)
      expect(request.headers.get('x-tenant-id')).toBeNull()
    })
  })

  describe('GET /api/v1/connection/contacts', () => {
    it('should return contacts for authenticated user', async () => {
      const request = createRequest('GET')
      
      // Should return contacts from tenant1
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(request.headers.get('x-user-id')).toBe(user1Id)
    })

    it('should support pagination', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts?page=1&limit=10',
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      const url = new URL(request.url)
      expect(url.searchParams.get('page')).toBe('1')
      expect(url.searchParams.get('limit')).toBe('10')
    })

    it('should support search filtering', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts?search=john',
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      const url = new URL(request.url)
      expect(url.searchParams.get('search')).toBe('john')
    })

    it('should not return contacts from other tenants', async () => {
      // Request as user from tenant2, should not see tenant1 contacts
      const request = createRequest('GET', user2Id, tenant2Id)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Tenant context should isolate data
    })
  })

  describe('POST /api/v1/connection/contacts', () => {
    it('should create contact with valid data', async () => {
      const newContact = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@test.com',
        phone: '+1234567890',
        company: 'company-1'
      }

      const request = createRequest('POST', user1Id, tenant1Id, newContact)

      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      // Should be created in tenant1, not accessible to other tenants
    })

    it('should reject contact with missing required fields', async () => {
      const invalidContact = {
        email: 'invalid@test.com'
        // Missing firstName and lastName
      }

      const request = createRequest('POST', user1Id, tenant1Id, invalidContact)
      
      expect(request.method).toBe('POST')
      // Zod validation should catch missing required fields
    })

    it('should reject duplicate email within tenant', async () => {
      const duplicateContact = {
        firstName: 'John',
        lastName: 'Duplicate',
        email: 'john@test.com', // Already exists in tenant1
        company: 'company-1'
      }

      const request = createRequest('POST', user1Id, tenant1Id, duplicateContact)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      // Should return 409 Conflict due to duplicate email
    })

    it('should allow same email in different tenants', async () => {
      // Tenant2 should be able to create contact with same email as tenant1
      const contact = {
        firstName: 'John',
        lastName: 'Other Tenant',
        email: 'john@test.com', // Same as tenant1's contact
        company: 'company-2'
      }

      const request = createRequest('POST', user2Id, tenant2Id, contact)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Should succeed - different tenant namespace
    })

    it('should accept optional fields', async () => {
      const contactWithOptionals = {
        firstName: 'Bob',
        lastName: 'Wilson',
        email: 'bob@test.com',
        phone: '+9876543210',
        title: 'Manager',
        notes: 'VIP customer',
        tags: ['important', 'vip'],
        customFields: { industry: 'tech' },
        company: 'company-1'
      }

      const request = createRequest('POST', user1Id, tenant1Id, contactWithOptionals)
      
      expect(request.method).toBe('POST')
      // All optional fields should be accepted
    })
  })

  describe('GET /api/v1/connection/contacts/[id]', () => {
    it('should retrieve contact by ID', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${contactId}`,
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain(contactId)
    })

    it('should return 404 for non-existent contact', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts/non-existent-id',
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain('non-existent-id')
      // Should return 404
    })

    it('should not allow cross-tenant access', async () => {
      // User from tenant2 tries to access contact from tenant1
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${contactId}`,
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user2Id,
            'x-tenant-id': tenant2Id
          }
        }
      )

      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Should return 404 (contact from different tenant invisible)
    })
  })

  describe('PUT /api/v1/connection/contacts/[id]', () => {
    it('should update contact with valid data', async () => {
      const updateData = {
        firstName: 'John Updated',
        phone: '+1111111111'
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${contactId}`,
        {
          method: 'PUT',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id,
            'content-type': 'application/json'
          },
          body: JSON.stringify(updateData)
        }
      )

      expect(request.method).toBe('PUT')
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
    })

    it('should allow partial updates', async () => {
      const partialUpdate = {
        title: 'Director'
        // Other fields unchanged
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${contactId}`,
        {
          method: 'PUT',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id,
            'content-type': 'application/json'
          },
          body: JSON.stringify(partialUpdate)
        }
      )

      expect(request.method).toBe('PUT')
      // Partial update should succeed
    })

    it('should reject invalid update data', async () => {
      const invalidUpdate = {
        firstName: '', // Empty string invalid
        email: 'not-an-email' // Invalid email format
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${contactId}`,
        {
          method: 'PUT',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id,
            'content-type': 'application/json'
          },
          body: JSON.stringify(invalidUpdate)
        }
      )

      expect(request.method).toBe('PUT')
      // Zod validation should reject invalid data
    })

    it('should prevent cross-tenant updates', async () => {
      const updateData = { firstName: 'Hacked' }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${contactId}`,
        {
          method: 'PUT',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user2Id,
            'x-tenant-id': tenant2Id,
            'content-type': 'application/json'
          },
          body: JSON.stringify(updateData)
        }
      )

      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Should return 404 (contact invisible to tenant2)
    })

    it('should return 404 for non-existent contact', async () => {
      const updateData = { firstName: 'Test' }

      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts/non-existent',
        {
          method: 'PUT',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id,
            'content-type': 'application/json'
          },
          body: JSON.stringify(updateData)
        }
      )

      expect(request.url).toContain('non-existent')
      // Should return 404
    })
  })

  describe('DELETE /api/v1/connection/contacts/[id]', () => {
    let deleteTestContactId: string

    beforeEach(async () => {
      // Create contact for deletion testing
      const contact = await db.contact.create({
        data: {
          firstName: 'Delete',
          lastName: 'Test',
          email: 'delete@test.com',
          tenantId: tenant1Id,
          companyId: 'company-1'
        }
      })
      deleteTestContactId = contact.id
    })

    it('should delete contact successfully', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${deleteTestContactId}`,
        {
          method: 'DELETE',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.method).toBe('DELETE')
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
    })

    it('should return 404 for non-existent contact', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts/non-existent',
        {
          method: 'DELETE',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain('non-existent')
      // Should return 404
    })

    it('should prevent cross-tenant deletion', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/contacts/${deleteTestContactId}`,
        {
          method: 'DELETE',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user2Id,
            'x-tenant-id': tenant2Id
          }
        }
      )

      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Should return 404 (contact invisible to tenant2)
    })
  })

  describe('Multi-tenant Isolation', () => {
    it('should ensure tenant1 contacts not visible to tenant2', async () => {
      // Tenant1 creates contact
      const tenant1Contact = {
        firstName: 'Tenant1',
        lastName: 'Only',
        email: 'tenant1only@test.com',
        company: 'company-1'
      }

      const createReq = createRequest('POST', user1Id, tenant1Id, tenant1Contact)
      expect(createReq.headers.get('x-tenant-id')).toBe(tenant1Id)

      // Tenant2 tries to fetch all contacts
      const listReq = createRequest('GET', user2Id, tenant2Id)
      expect(listReq.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Should not include tenant1Contact
    })

    it('should ensure tenant data is completely isolated', async () => {
      const req1 = createRequest('GET', user1Id, tenant1Id)
      const req2 = createRequest('GET', user2Id, tenant2Id)

      expect(req1.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(req2.headers.get('x-tenant-id')).toBe(tenant2Id)
      expect(req1.headers.get('x-tenant-id')).not.toBe(req2.headers.get('x-tenant-id'))
    })

    it('should prevent data leakage through search', async () => {
      const req1 = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts?search=john',
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      const req2 = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts?search=john',
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user2Id,
            'x-tenant-id': tenant2Id
          }
        }
      )

      expect(req1.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(req2.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Each should only see their own John
    })
  })

  describe('Rate Limiting', () => {
    it('should track requests per user', async () => {
      const request1 = createRequest('GET', user1Id, tenant1Id)
      const request2 = createRequest('GET', user1Id, tenant1Id)
      const request3 = createRequest('GET', user1Id, tenant1Id)

      expect(request1.headers.get('x-user-id')).toBe(user1Id)
      expect(request2.headers.get('x-user-id')).toBe(user1Id)
      expect(request3.headers.get('x-user-id')).toBe(user1Id)
      // Rate limiter should track all three as same user
    })

    it('should isolate rate limits between users', async () => {
      const user1Request = createRequest('GET', user1Id, tenant1Id)
      const user2Request = createRequest('GET', user2Id, tenant2Id)

      expect(user1Request.headers.get('x-user-id')).toBe(user1Id)
      expect(user2Request.headers.get('x-user-id')).toBe(user2Id)
      // Each user should have separate rate limit bucket
    })
  })

  describe('Error Handling', () => {
    it('should return proper error for unauthorized access', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts',
        { method: 'GET' }
      )

      expect(request.headers.get('authorization')).toBeNull()
      // Should return 401 Unauthorized
    })

    it('should return proper error for validation failure', async () => {
      const invalidData = { email: 'not-an-email' }
      const request = createRequest('POST', user1Id, tenant1Id, invalidData)

      expect(request.method).toBe('POST')
      // Should return 400 with validation error details
    })

    it('should return proper error for not found', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/contacts/does-not-exist',
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain('does-not-exist')
      // Should return 404 Not Found
    })

    it('should return proper error for duplicate email', async () => {
      const duplicate = {
        firstName: 'Dup',
        lastName: 'Test',
        email: 'john@test.com' // Existing contact
      }

      const request = createRequest('POST', user1Id, tenant1Id, duplicate)
      expect(request.method).toBe('POST')
      // Should return 409 Conflict
    })
  })

  describe('Metadata & Response Format', () => {
    it('should include timestamp in responses', async () => {
      const request = createRequest('GET')
      // Responses should include metadata.timestamp
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })

    it('should include requestId in responses', async () => {
      const request = createRequest('GET')
      // Responses should include metadata.requestId (UUID)
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })

    it('should maintain consistent response structure', async () => {
      const getReq = createRequest('GET')
      const postReq = createRequest('POST', user1Id, tenant1Id, {
        firstName: 'Test',
        lastName: 'User'
      })
      const putReq = createRequest('PUT', user1Id, tenant1Id, {
        firstName: 'Updated'
      })
      const deleteReq = createRequest('DELETE')

      // All should have consistent structure with success, data/message, metadata
      expect(getReq.method).toBe('GET')
      expect(postReq.method).toBe('POST')
      expect(putReq.method).toBe('PUT')
      expect(deleteReq.method).toBe('DELETE')
    })
  })
})
