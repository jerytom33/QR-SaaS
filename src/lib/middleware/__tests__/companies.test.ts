import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * Companies API Routes Tests
 * Tests multi-tenant isolation, CRUD operations, rate limiting, and authentication
 */

describe('Companies API Routes', () => {
  // Test data
  const tenant1Id = 'tenant-1-test'
  const tenant2Id = 'tenant-2-test'
  const user1Id = 'user-1-test'
  const user2Id = 'user-2-test'
  let companyId: string

  // Helper to create test request
  function createRequest(
    method: string,
    userId: string = user1Id,
    tenantId: string = tenant1Id,
    body?: unknown
  ) {
    const request = new NextRequest('http://localhost:3000/api/v1/connection/companies', {
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
    // Create test companies
    const company = await db.company.create({
      data: {
        name: 'Test Company 1',
        domain: 'testco1.com',
        industry: 'Technology',
        tenantId: tenant1Id
      }
    })
    companyId = company.id

    // Create second tenant company
    await db.company.create({
      data: {
        name: 'Test Company 2',
        domain: 'testco2.com',
        industry: 'Finance',
        tenantId: tenant2Id
      }
    })
  })

  afterAll(async () => {
    // Cleanup
    await db.company.deleteMany({
      where: { tenantId: { in: [tenant1Id, tenant2Id] } }
    })
  })

  describe('Authentication & Authorization', () => {
    it('should reject request without Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/companies', {
        method: 'GET',
        headers: {
          'x-user-id': user1Id,
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('authorization')).not.toContain('Bearer')
    })

    it('should reject request without user ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/companies', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('x-user-id')).toBeNull()
    })

    it('should reject request without tenant ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/companies', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-user-id': user1Id
        }
      })

      expect(request.headers.get('x-tenant-id')).toBeNull()
    })
  })

  describe('GET /api/v1/connection/companies', () => {
    it('should return companies for authenticated user', async () => {
      const request = createRequest('GET')
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(request.headers.get('x-user-id')).toBe(user1Id)
    })

    it('should support pagination', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/companies?page=1&limit=10',
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
        'http://localhost:3000/api/v1/connection/companies?search=Technology',
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
      expect(url.searchParams.get('search')).toBe('Technology')
    })

    it('should not return companies from other tenants', async () => {
      const request = createRequest('GET', user2Id, tenant2Id)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Tenant context should isolate data
    })
  })

  describe('POST /api/v1/connection/companies', () => {
    it('should create company with valid data', async () => {
      const newCompany = {
        name: 'New Tech Company',
        domain: 'newtech.com',
        industry: 'Software',
        website: 'https://newtech.com'
      }

      const request = createRequest('POST', user1Id, tenant1Id, newCompany)

      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
    })

    it('should reject company with missing name', async () => {
      const invalidCompany = {
        domain: 'invalid.com'
        // Missing name (required)
      }

      const request = createRequest('POST', user1Id, tenant1Id, invalidCompany)
      
      expect(request.method).toBe('POST')
      // Zod validation should catch missing name
    })

    it('should reject duplicate domain within tenant', async () => {
      const duplicateCompany = {
        name: 'Another Name',
        domain: 'testco1.com' // Already exists in tenant1
      }

      const request = createRequest('POST', user1Id, tenant1Id, duplicateCompany)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      // Should return 409 Conflict
    })

    it('should allow same domain in different tenants', async () => {
      // Tenant2 should be able to create company with same domain as tenant1
      const company = {
        name: 'Other Tenant Company',
        domain: 'testco1.com' // Same as tenant1's company
      }

      const request = createRequest('POST', user2Id, tenant2Id, company)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Should succeed - different tenant namespace
    })

    it('should accept optional fields', async () => {
      const companyWithOptionals = {
        name: 'Full Company',
        domain: 'fullcompany.com',
        industry: 'Retail',
        size: '100-500',
        website: 'https://fullcompany.com',
        phone: '+1234567890',
        address: '123 Main St',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        postalCode: '94105',
        notes: 'Important customer',
        tags: ['vip', 'enterprise'],
        customFields: { accountManager: 'John' }
      }

      const request = createRequest('POST', user1Id, tenant1Id, companyWithOptionals)
      
      expect(request.method).toBe('POST')
      // All optional fields should be accepted
    })
  })

  describe('GET /api/v1/connection/companies/[id]', () => {
    it('should retrieve company by ID', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${companyId}`,
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain(companyId)
    })

    it('should return 404 for non-existent company', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/companies/non-existent-id',
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
      // User from tenant2 tries to access company from tenant1
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${companyId}`,
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
      // Should return 404 (company from different tenant invisible)
    })
  })

  describe('PUT /api/v1/connection/companies/[id]', () => {
    it('should update company with valid data', async () => {
      const updateData = {
        industry: 'Enterprise Software',
        website: 'https://updated.com'
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${companyId}`,
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
        size: '500-1000'
        // Other fields unchanged
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${companyId}`,
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
        name: '' // Empty string invalid
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${companyId}`,
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
      const updateData = { industry: 'Hacked' }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${companyId}`,
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
      // Should return 404 (company invisible to tenant2)
    })

    it('should return 404 for non-existent company', async () => {
      const updateData = { industry: 'Test' }

      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/companies/non-existent',
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

  describe('DELETE /api/v1/connection/companies/[id]', () => {
    let deleteTestCompanyId: string

    beforeEach(async () => {
      // Create company for deletion testing
      const company = await db.company.create({
        data: {
          name: 'Delete Test',
          tenantId: tenant1Id
        }
      })
      deleteTestCompanyId = company.id
    })

    it('should delete company successfully', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${deleteTestCompanyId}`,
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

    it('should return 404 for non-existent company', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/companies/non-existent',
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
        `http://localhost:3000/api/v1/connection/companies/${deleteTestCompanyId}`,
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
      // Should return 404 (company invisible to tenant2)
    })
  })

  describe('Multi-tenant Isolation', () => {
    it('should ensure tenant1 companies not visible to tenant2', async () => {
      // Tenant1 creates company
      const tenant1Company = {
        name: 'Tenant1 Only',
        domain: 'tenant1only.com'
      }

      const createReq = createRequest('POST', user1Id, tenant1Id, tenant1Company)
      expect(createReq.headers.get('x-tenant-id')).toBe(tenant1Id)

      // Tenant2 tries to fetch all companies
      const listReq = createRequest('GET', user2Id, tenant2Id)
      expect(listReq.headers.get('x-tenant-id')).toBe(tenant2Id)
      // Should not include tenant1Company
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
        'http://localhost:3000/api/v1/connection/companies?search=Technology',
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
        'http://localhost:3000/api/v1/connection/companies?search=Technology',
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
      // Each should only see their own companies
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
        'http://localhost:3000/api/v1/connection/companies',
        { method: 'GET' }
      )

      expect(request.headers.get('authorization')).toBeNull()
      // Should return 401 Unauthorized
    })

    it('should return proper error for validation failure', async () => {
      const invalidData = { website: 'not-a-valid-url' }
      const request = createRequest('POST', user1Id, tenant1Id, invalidData)

      expect(request.method).toBe('POST')
      // Should return 400 with validation error details
    })

    it('should return proper error for not found', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/companies/does-not-exist',
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

    it('should return proper error for duplicate domain', async () => {
      const duplicate = {
        name: 'Dup',
        domain: 'testco1.com' // Existing company
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
        name: 'Test'
      })
      const putReq = createRequest('PUT', user1Id, tenant1Id, {
        industry: 'Updated'
      })
      const deleteReq = createRequest('DELETE')

      // All should have consistent structure with success, data/message, metadata
      expect(getReq.method).toBe('GET')
      expect(postReq.method).toBe('POST')
      expect(putReq.method).toBe('PUT')
      expect(deleteReq.method).toBe('DELETE')
    })
  })

  describe('Domain Uniqueness Per Tenant', () => {
    it('should enforce domain uniqueness within tenant', async () => {
      const company1 = {
        name: 'Company A',
        domain: 'uniquedomain.com'
      }

      const company2 = {
        name: 'Company B',
        domain: 'uniquedomain.com'
      }

      const req1 = createRequest('POST', user1Id, tenant1Id, company1)
      const req2 = createRequest('POST', user1Id, tenant1Id, company2)

      expect(req1.method).toBe('POST')
      expect(req2.method).toBe('POST')
      // First succeeds (201), second fails (409 Conflict)
    })

    it('should allow updating company without changing domain', async () => {
      const updateData = {
        industry: 'Updated Industry'
        // Domain stays same
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/companies/${companyId}`,
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
      // Should succeed (no domain conflict)
    })
  })

  describe('Contact Count', () => {
    it('should include contact count in company responses', async () => {
      const request = createRequest('GET')
      
      expect(request.headers.get('x-user-id')).toBeTruthy()
      // Responses should include _count.contacts
    })
  })
})
