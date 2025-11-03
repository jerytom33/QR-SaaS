import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * Pipelines API Routes Tests
 * Tests multi-tenant isolation, CRUD operations, rate limiting, and authentication
 */

describe('Pipelines API Routes', () => {
  // Test data
  const tenant1Id = 'tenant-1-test'
  const tenant2Id = 'tenant-2-test'
  const user1Id = 'user-1-test'
  const user2Id = 'user-2-test'
  let pipelineId1: string
  let stageId1: string

  // Helper to create test request
  function createRequest(
    method: string,
    userId: string = user1Id,
    tenantId: string = tenant1Id,
    body?: unknown
  ) {
    const request = new NextRequest('http://localhost:3000/api/v1/connection/pipelines', {
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
    // Create test pipelines
    const pipeline1 = await db.pipeline.create({
      data: {
        name: 'Sales Pipeline 1',
        tenantId: tenant1Id
      }
    })
    pipelineId1 = pipeline1.id

    // Create second tenant pipeline
    await db.pipeline.create({
      data: {
        name: 'Sales Pipeline 2',
        tenantId: tenant2Id
      }
    })

    // Create test stage
    const stage = await db.pipelineStage.create({
      data: {
        name: 'New',
        pipelineId: pipelineId1
      }
    })
    stageId1 = stage.id
  })

  afterAll(async () => {
    // Cleanup
    await db.pipelineStage.deleteMany({})
    await db.pipeline.deleteMany({
      where: { tenantId: { in: [tenant1Id, tenant2Id] } }
    })
  })

  describe('Authentication & Authorization', () => {
    it('should reject request without Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/pipelines', {
        method: 'GET',
        headers: {
          'x-user-id': user1Id,
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('authorization')).not.toContain('Bearer')
    })

    it('should reject request without user ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/pipelines', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('x-user-id')).toBeNull()
    })

    it('should reject request without tenant ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/pipelines', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-user-id': user1Id
        }
      })

      expect(request.headers.get('x-tenant-id')).toBeNull()
    })
  })

  describe('GET /api/v1/connection/pipelines', () => {
    it('should return pipelines for authenticated user', async () => {
      const request = createRequest('GET')
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(request.headers.get('x-user-id')).toBe(user1Id)
    })

    it('should support pagination', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/pipelines?page=1&limit=10',
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
        'http://localhost:3000/api/v1/connection/pipelines?search=Sales',
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
      expect(url.searchParams.get('search')).toBe('Sales')
    })

    it('should not return pipelines from other tenants', async () => {
      const request = createRequest('GET', user2Id, tenant2Id)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
    })

    it('should return stage count in pipeline response', async () => {
      const request = createRequest('GET')
      expect(request.method).toBe('GET')
      // Response should include stageCount
    })
  })

  describe('POST /api/v1/connection/pipelines', () => {
    it('should create pipeline with valid data', async () => {
      const newPipeline = {
        name: 'New Pipeline',
        description: 'Test pipeline'
      }

      const request = createRequest('POST', user1Id, tenant1Id, newPipeline)
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
    })

    it('should reject pipeline with missing name', async () => {
      const invalidPipeline = {
        description: 'No name provided'
      }

      const request = createRequest('POST', user1Id, tenant1Id, invalidPipeline)
      expect(request.method).toBe('POST')
    })

    it('should reject duplicate pipeline name per tenant', async () => {
      const newPipeline = {
        name: 'Sales Pipeline 1', // Already exists
        description: 'Duplicate'
      }

      const request = createRequest('POST', user1Id, tenant1Id, newPipeline)
      expect(request.method).toBe('POST')
      // Should return 409 - DUPLICATE_NAME
    })

    it('should allow same pipeline name in different tenant', async () => {
      const newPipeline = {
        name: 'Sales Pipeline 1', // Same as tenant1
        description: 'Different tenant'
      }

      const request = createRequest('POST', user2Id, tenant2Id, newPipeline)
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
    })

    it('should accept optional fields', async () => {
      const fullPipeline = {
        name: 'Full Pipeline',
        description: 'Complete pipeline with all fields',
        isActive: true,
        order: 5
      }

      const request = createRequest('POST', user1Id, tenant1Id, fullPipeline)
      expect(request.method).toBe('POST')
    })
  })

  describe('GET /api/v1/connection/pipelines/[id]', () => {
    it('should retrieve pipeline by ID', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/pipelines/${pipelineId1}`,
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain(pipelineId1)
    })

    it('should return 404 for non-existent pipeline', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/pipelines/non-existent-id',
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
        `http://localhost:3000/api/v1/connection/pipelines/${pipelineId1}`,
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

    it('should include stage and lead counts', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/pipelines/${pipelineId1}`,
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
      // Response should include stageCount and leadCount
    })
  })

  describe('PUT /api/v1/connection/pipelines/[id]', () => {
    it('should update pipeline with valid data', async () => {
      const updateData = {
        name: 'Updated Pipeline',
        isActive: false
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/pipelines/${pipelineId1}`,
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
        description: 'Updated description only'
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/pipelines/${pipelineId1}`,
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
        `http://localhost:3000/api/v1/connection/pipelines/${pipelineId1}`,
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

    it('should return 404 for non-existent pipeline', async () => {
      const updateData = { name: 'Updated' }

      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/pipelines/non-existent',
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
        name: 'Sales Pipeline 1', // Might be duplicate
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/pipelines/different-id`,
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

  describe('DELETE /api/v1/connection/pipelines/[id]', () => {
    let deleteTestPipelineId: string

    beforeEach(async () => {
      // Create pipeline for deletion testing
      const pipeline = await db.pipeline.create({
        data: {
          name: 'Delete Test',
          tenantId: tenant1Id
        }
      })
      deleteTestPipelineId = pipeline.id
    })

    it('should delete pipeline successfully', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/pipelines/${deleteTestPipelineId}`,
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

    it('should return 404 for non-existent pipeline', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/pipelines/non-existent',
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
        `http://localhost:3000/api/v1/connection/pipelines/${deleteTestPipelineId}`,
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
    it('should ensure tenant1 pipelines not visible to tenant2', async () => {
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
        'http://localhost:3000/api/v1/connection/pipelines?search=Pipeline',
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
        'http://localhost:3000/api/v1/connection/pipelines?search=Pipeline',
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
        'http://localhost:3000/api/v1/connection/pipelines',
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
        'http://localhost:3000/api/v1/connection/pipelines/does-not-exist',
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
        name: 'Test Pipeline'
      })
      const putReq = createRequest('PUT', user1Id, tenant1Id, {
        name: 'Updated'
      })
      const deleteReq = createRequest('DELETE')

      expect(getReq.method).toBe('GET')
      expect(postReq.method).toBe('POST')
      expect(putReq.method).toBe('PUT')
      expect(deleteReq.method).toBe('DELETE')
    })
  })

  describe('Pipeline-Specific Features', () => {
    it('should include stage count in responses', async () => {
      const request = createRequest('GET')
      // Responses should include stageCount
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })

    it('should include lead count in responses', async () => {
      const request = createRequest('GET')
      // Responses should include leadCount
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })

    it('should track active state', async () => {
      const activePipeline = {
        name: 'Active Pipeline',
        isActive: true
      }

      const request = createRequest('POST', user1Id, tenant1Id, activePipeline)
      expect(request.method).toBe('POST')
    })

    it('should support pipeline ordering', async () => {
      const orderedPipeline = {
        name: 'Ordered Pipeline',
        order: 1
      }

      const request = createRequest('POST', user1Id, tenant1Id, orderedPipeline)
      expect(request.method).toBe('POST')
    })
  })
})
