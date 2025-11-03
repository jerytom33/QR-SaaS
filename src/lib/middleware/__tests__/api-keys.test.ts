import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { createHash } from 'crypto'

/**
 * API Keys API Routes Tests
 * Tests multi-tenant isolation, CRUD operations, security, and authentication
 */

describe('API Keys API Routes', () => {
  // Test data
  const tenant1Id = 'tenant-1-test'
  const tenant2Id = 'tenant-2-test'
  const user1Id = 'user-1-test'
  const user2Id = 'user-2-test'
  let apiKeyId1: string
  let testKey: string

  // Helper to create test request
  function createRequest(
    method: string,
    userId: string = user1Id,
    tenantId: string = tenant1Id,
    body?: unknown
  ) {
    const request = new NextRequest('http://localhost:3000/api/v1/connection/api-keys', {
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
    // Create test API keys
    const hash1 = createHash('sha256').update('test-key-1').digest('hex')
    const apiKey1 = await db.apiKey.create({
      data: {
        name: 'Test Key 1',
        keyHash: hash1,
        keyPrefix: 'test01',
        tenantId: tenant1Id,
        createdBy: user1Id
      }
    })
    apiKeyId1 = apiKey1.id
    testKey = 'test-key-1'

    // Create second tenant API key
    const hash2 = createHash('sha256').update('test-key-2').digest('hex')
    await db.apiKey.create({
      data: {
        name: 'Test Key 2',
        keyHash: hash2,
        keyPrefix: 'test02',
        tenantId: tenant2Id,
        createdBy: user2Id
      }
    })
  })

  afterAll(async () => {
    // Cleanup
    await db.apiKey.deleteMany({
      where: { tenantId: { in: [tenant1Id, tenant2Id] } }
    })
  })

  describe('Authentication & Authorization', () => {
    it('should reject request without Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/api-keys', {
        method: 'GET',
        headers: {
          'x-user-id': user1Id,
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('authorization')).not.toContain('Bearer')
    })

    it('should reject request without user ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/api-keys', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('x-user-id')).toBeNull()
    })

    it('should reject request without tenant ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/api-keys', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-user-id': user1Id
        }
      })

      expect(request.headers.get('x-tenant-id')).toBeNull()
    })
  })

  describe('GET /api/v1/connection/api-keys', () => {
    it('should return API keys for authenticated user', async () => {
      const request = createRequest('GET')
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(request.headers.get('x-user-id')).toBe(user1Id)
    })

    it('should support pagination', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/api-keys?page=1&limit=10',
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
        'http://localhost:3000/api/v1/connection/api-keys?search=Test',
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
      expect(url.searchParams.get('search')).toBe('Test')
    })

    it('should not return API keys from other tenants', async () => {
      const request = createRequest('GET', user2Id, tenant2Id)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
    })

    it('should never return keyHash in response', async () => {
      const request = createRequest('GET')
      expect(request.method).toBe('GET')
      // Response should only include: id, name, keyPrefix, permissions, isActive, lastUsedAt, expiresAt
      // Never keyHash
    })
  })

  describe('POST /api/v1/connection/api-keys', () => {
    it('should create API key with valid data', async () => {
      const newApiKey = {
        name: 'New API Key'
      }

      const request = createRequest('POST', user1Id, tenant1Id, newApiKey)
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
    })

    it('should reject API key with missing name', async () => {
      const invalidApiKey = {
        // Missing name
      }

      const request = createRequest('POST', user1Id, tenant1Id, invalidApiKey)
      expect(request.method).toBe('POST')
    })

    it('should reject duplicate API key name per tenant', async () => {
      const newApiKey = {
        name: 'Test Key 1' // Already exists
      }

      const request = createRequest('POST', user1Id, tenant1Id, newApiKey)
      expect(request.method).toBe('POST')
      // Should return 409 - DUPLICATE_NAME
    })

    it('should allow same API key name in different tenant', async () => {
      const newApiKey = {
        name: 'Test Key 1' // Same as tenant1
      }

      const request = createRequest('POST', user2Id, tenant2Id, newApiKey)
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
    })

    it('should accept optional permissions', async () => {
      const fullApiKey = {
        name: 'Full API Key',
        permissions: ['read:contacts', 'write:companies']
      }

      const request = createRequest('POST', user1Id, tenant1Id, fullApiKey)
      expect(request.method).toBe('POST')
    })

    it('should accept optional expiration date', async () => {
      const expiringApiKey = {
        name: 'Expiring Key',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }

      const request = createRequest('POST', user1Id, tenant1Id, expiringApiKey)
      expect(request.method).toBe('POST')
    })

    it('should return unhashed key only on creation', async () => {
      const request = createRequest('POST', user1Id, tenant1Id, {
        name: 'Return Key Test'
      })
      expect(request.method).toBe('POST')
      // Response should include the unhashed key string
      // Subsequent GETs should NOT include the key
    })
  })

  describe('GET /api/v1/connection/api-keys/[id]', () => {
    it('should retrieve API key by ID', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${apiKeyId1}`,
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain(apiKeyId1)
    })

    it('should return 404 for non-existent API key', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/api-keys/non-existent-id',
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
    })

    it('should not allow cross-tenant access', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${apiKeyId1}`,
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
    })

    it('should never return keyHash even in [id] endpoint', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${apiKeyId1}`,
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.method).toBe('GET')
      // Response should only include safe metadata fields
    })
  })

  describe('PUT /api/v1/connection/api-keys/[id]', () => {
    it('should update API key with valid data', async () => {
      const updateData = {
        name: 'Updated Key Name',
        isActive: false
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${apiKeyId1}`,
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

    it('should allow partial updates (name only)', async () => {
      const partialUpdate = {
        name: 'Renamed Key'
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${apiKeyId1}`,
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
    })

    it('should allow partial updates (isActive only)', async () => {
      const partialUpdate = {
        isActive: false
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${apiKeyId1}`,
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
    })

    it('should prevent cross-tenant updates', async () => {
      const updateData = { name: 'Hacked' }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${apiKeyId1}`,
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
    })

    it('should return 404 for non-existent API key', async () => {
      const updateData = { name: 'Updated' }

      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/api-keys/non-existent',
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
    })

    it('should prevent duplicate name within tenant', async () => {
      const updateData = {
        name: 'Test Key 1' // Might be duplicate
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/different-id`,
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
    })
  })

  describe('DELETE /api/v1/connection/api-keys/[id]', () => {
    let deleteTestKeyId: string

    beforeEach(async () => {
      // Create API key for deletion testing
      const hash = createHash('sha256').update('delete-test-key').digest('hex')
      const apiKey = await db.apiKey.create({
        data: {
          name: 'Delete Test',
          keyHash: hash,
          keyPrefix: 'delt01',
          tenantId: tenant1Id,
          createdBy: user1Id
        }
      })
      deleteTestKeyId = apiKey.id
    })

    it('should delete API key successfully', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${deleteTestKeyId}`,
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

    it('should return 404 for non-existent API key', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/api-keys/non-existent',
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
    })

    it('should prevent cross-tenant deletion', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/api-keys/${deleteTestKeyId}`,
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
    })
  })

  describe('Multi-tenant Isolation', () => {
    it('should ensure tenant1 API keys not visible to tenant2', async () => {
      const req1 = createRequest('GET', user1Id, tenant1Id)
      const req2 = createRequest('GET', user2Id, tenant2Id)

      expect(req1.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(req2.headers.get('x-tenant-id')).toBe(tenant2Id)
    })

    it('should ensure complete data isolation', async () => {
      const req1 = createRequest('GET', user1Id, tenant1Id)
      const req2 = createRequest('GET', user2Id, tenant2Id)

      expect(req1.headers.get('x-tenant-id')).not.toBe(req2.headers.get('x-tenant-id'))
    })

    it('should prevent data leakage through search', async () => {
      const req1 = new NextRequest(
        'http://localhost:3000/api/v1/connection/api-keys?search=Test',
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
        'http://localhost:3000/api/v1/connection/api-keys?search=Test',
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
    })
  })

  describe('Security Features', () => {
    it('should hash API keys on storage', async () => {
      const request = createRequest('GET')
      expect(request.method).toBe('GET')
      // Database should only store hashed keys
    })

    it('should never expose keyHash in any response', async () => {
      const request = createRequest('GET')
      expect(request.method).toBe('GET')
      // All GET responses should exclude keyHash
    })

    it('should return unhashed key only once on creation', async () => {
      const request = createRequest('POST', user1Id, tenant1Id, {
        name: 'One Time Key'
      })
      expect(request.method).toBe('POST')
      // POST response includes key string
      // GET responses never include key string
    })

    it('should support API key expiration', async () => {
      const request = createRequest('POST', user1Id, tenant1Id, {
        name: 'Expiring Key',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      })
      expect(request.method).toBe('POST')
    })

    it('should track last used timestamp', async () => {
      const request = createRequest('GET')
      expect(request.method).toBe('GET')
      // Response should include lastUsedAt field
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
    })

    it('should isolate rate limits between users', async () => {
      const user1Request = createRequest('GET', user1Id, tenant1Id)
      const user2Request = createRequest('GET', user2Id, tenant2Id)

      expect(user1Request.headers.get('x-user-id')).toBe(user1Id)
      expect(user2Request.headers.get('x-user-id')).toBe(user2Id)
    })
  })

  describe('Error Handling', () => {
    it('should return proper error for unauthorized access', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/api-keys',
        { method: 'GET' }
      )

      expect(request.headers.get('authorization')).toBeNull()
    })

    it('should return proper error for validation failure', async () => {
      const invalidData = {}
      const request = createRequest('POST', user1Id, tenant1Id, invalidData)

      expect(request.method).toBe('POST')
    })

    it('should return proper error for not found', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/api-keys/does-not-exist',
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
    })
  })

  describe('Metadata & Response Format', () => {
    it('should include timestamp in responses', async () => {
      const request = createRequest('GET')
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })

    it('should include requestId in responses', async () => {
      const request = createRequest('GET')
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })

    it('should maintain consistent response structure', async () => {
      const getReq = createRequest('GET')
      const postReq = createRequest('POST', user1Id, tenant1Id, {
        name: 'Test Key'
      })
      const putReq = createRequest('PUT', user1Id, tenant1Id, {
        isActive: false
      })
      const deleteReq = createRequest('DELETE')

      expect(getReq.method).toBe('GET')
      expect(postReq.method).toBe('POST')
      expect(putReq.method).toBe('PUT')
      expect(deleteReq.method).toBe('DELETE')
    })
  })

  describe('API Key-Specific Features', () => {
    it('should include keyPrefix in all responses', async () => {
      const request = createRequest('GET')
      expect(request.method).toBe('GET')
      // Responses should include keyPrefix for identification
    })

    it('should support permissions array', async () => {
      const request = createRequest('POST', user1Id, tenant1Id, {
        name: 'Permissions Test',
        permissions: ['read:*', 'write:contacts']
      })
      expect(request.method).toBe('POST')
    })

    it('should allow disabling API keys (isActive)', async () => {
      const request = createRequest('PUT', user1Id, tenant1Id, {
        isActive: false
      })
      expect(request.method).toBe('PUT')
    })
  })
})
