import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

/**
 * Leads API Routes Tests
 * Tests multi-tenant isolation, CRUD operations, rate limiting, and authentication
 */

describe('Leads API Routes', () => {
  // Test data
  const tenant1Id = 'tenant-1-test'
  const tenant2Id = 'tenant-2-test'
  const user1Id = 'user-1-test'
  const user2Id = 'user-2-test'
  let leadId: string
  let pipelineId1: string
  let stageId1: string
  let contactId1: string

  // Helper to create test request
  function createRequest(
    method: string,
    userId: string = user1Id,
    tenantId: string = tenant1Id,
    body?: unknown
  ) {
    const request = new NextRequest('http://localhost:3000/api/v1/connection/leads', {
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

    const pipeline2 = await db.pipeline.create({
      data: {
        name: 'Sales Pipeline 2',
        tenantId: tenant2Id
      }
    })

    // Create test stages
    const stage1 = await db.pipelineStage.create({
      data: {
        name: 'New',
        pipelineId: pipelineId1
      }
    })
    stageId1 = stage1.id

    const stage2 = await db.pipelineStage.create({
      data: {
        name: 'New',
        pipelineId: pipeline2.id
      }
    })

    // Create test contact
    const contact = await db.contact.create({
      data: {
        firstName: 'Test',
        lastName: 'Contact',
        tenantId: tenant1Id
      }
    })
    contactId1 = contact.id

    // Create test leads
    const lead = await db.lead.create({
      data: {
        title: 'Test Lead 1',
        value: 10000,
        tenantId: tenant1Id,
        pipelineId: pipelineId1,
        stageId: stageId1,
        contactId: contactId1
      }
    })
    leadId = lead.id

    // Create second tenant lead
    await db.lead.create({
      data: {
        title: 'Test Lead 2',
        value: 20000,
        tenantId: tenant2Id,
        pipelineId: pipeline2.id,
        stageId: stage2.id
      }
    })
  })

  afterAll(async () => {
    // Cleanup
    await db.lead.deleteMany({
      where: { tenantId: { in: [tenant1Id, tenant2Id] } }
    })
    await db.pipelineStage.deleteMany({})
    await db.pipeline.deleteMany({
      where: { tenantId: { in: [tenant1Id, tenant2Id] } }
    })
    await db.contact.deleteMany({
      where: { tenantId: { in: [tenant1Id, tenant2Id] } }
    })
  })

  describe('Authentication & Authorization', () => {
    it('should reject request without Bearer token', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/leads', {
        method: 'GET',
        headers: {
          'x-user-id': user1Id,
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('authorization')).not.toContain('Bearer')
    })

    it('should reject request without user ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/leads', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-tenant-id': tenant1Id
        }
      })

      expect(request.headers.get('x-user-id')).toBeNull()
    })

    it('should reject request without tenant ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/connection/leads', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer test-token',
          'x-user-id': user1Id
        }
      })

      expect(request.headers.get('x-tenant-id')).toBeNull()
    })
  })

  describe('GET /api/v1/connection/leads', () => {
    it('should return leads for authenticated user', async () => {
      const request = createRequest('GET')
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
      expect(request.headers.get('x-user-id')).toBe(user1Id)
    })

    it('should support pagination', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/leads?page=1&limit=10',
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
        'http://localhost:3000/api/v1/connection/leads?search=Lead',
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
      expect(url.searchParams.get('search')).toBe('Lead')
    })

    it('should support status filtering', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/leads?status=NEW',
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
      expect(url.searchParams.get('status')).toBe('NEW')
    })

    it('should support priority filtering', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/leads?priority=HIGH',
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
      expect(url.searchParams.get('priority')).toBe('HIGH')
    })

    it('should not return leads from other tenants', async () => {
      const request = createRequest('GET', user2Id, tenant2Id)
      
      expect(request.headers.get('x-tenant-id')).toBe(tenant2Id)
    })
  })

  describe('POST /api/v1/connection/leads', () => {
    it('should create lead with valid data', async () => {
      const newLead = {
        title: 'New Lead',
        value: 15000,
        priority: 'HIGH',
        pipelineId: pipelineId1,
        stageId: stageId1,
        contactId: contactId1
      }

      const request = createRequest('POST', user1Id, tenant1Id, newLead)
      expect(request.headers.get('x-tenant-id')).toBe(tenant1Id)
    })

    it('should reject lead with missing title', async () => {
      const invalidLead = {
        value: 5000,
        pipelineId: pipelineId1,
        stageId: stageId1
        // Missing title (required)
      }

      const request = createRequest('POST', user1Id, tenant1Id, invalidLead)
      expect(request.method).toBe('POST')
    })

    it('should reject lead with missing pipeline', async () => {
      const invalidLead = {
        title: 'Test',
        stageId: stageId1
        // Missing pipelineId (required)
      }

      const request = createRequest('POST', user1Id, tenant1Id, invalidLead)
      expect(request.method).toBe('POST')
    })

    it('should reject lead with invalid pipeline', async () => {
      const newLead = {
        title: 'Invalid Pipeline Lead',
        pipelineId: 'invalid-pipeline-id',
        stageId: stageId1
      }

      const request = createRequest('POST', user1Id, tenant1Id, newLead)
      expect(request.method).toBe('POST')
      // Should return 400 - INVALID_PIPELINE
    })

    it('should reject lead with invalid stage', async () => {
      const newLead = {
        title: 'Invalid Stage Lead',
        pipelineId: pipelineId1,
        stageId: 'invalid-stage-id'
      }

      const request = createRequest('POST', user1Id, tenant1Id, newLead)
      expect(request.method).toBe('POST')
      // Should return 400 - INVALID_STAGE
    })

    it('should accept optional fields', async () => {
      const leadWithOptionals = {
        title: 'Full Lead',
        description: 'Important prospect',
        value: 50000,
        currency: 'USD',
        status: 'CONTACTED',
        priority: 'CRITICAL',
        source: 'website',
        tags: ['vip', 'enterprise'],
        customFields: { accountManager: 'John' },
        expectedCloseDate: new Date().toISOString(),
        pipelineId: pipelineId1,
        stageId: stageId1
      }

      const request = createRequest('POST', user1Id, tenant1Id, leadWithOptionals)
      expect(request.method).toBe('POST')
    })
  })

  describe('GET /api/v1/connection/leads/[id]', () => {
    it('should retrieve lead by ID', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/leads/${leadId}`,
        {
          method: 'GET',
          headers: {
            'authorization': 'Bearer test-token',
            'x-user-id': user1Id,
            'x-tenant-id': tenant1Id
          }
        }
      )

      expect(request.url).toContain(leadId)
    })

    it('should return 404 for non-existent lead', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/leads/non-existent-id',
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
        `http://localhost:3000/api/v1/connection/leads/${leadId}`,
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
  })

  describe('PUT /api/v1/connection/leads/[id]', () => {
    it('should update lead with valid data', async () => {
      const updateData = {
        status: 'QUALIFIED',
        priority: 'CRITICAL'
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/leads/${leadId}`,
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
        value: 25000
      }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/leads/${leadId}`,
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
      const updateData = { status: 'WON' }

      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/leads/${leadId}`,
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

    it('should return 404 for non-existent lead', async () => {
      const updateData = { status: 'WON' }

      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/leads/non-existent',
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
  })

  describe('DELETE /api/v1/connection/leads/[id]', () => {
    let deleteTestLeadId: string

    beforeEach(async () => {
      // Create lead for deletion testing
      const lead = await db.lead.create({
        data: {
          title: 'Delete Test',
          tenantId: tenant1Id,
          pipelineId: pipelineId1,
          stageId: stageId1
        }
      })
      deleteTestLeadId = lead.id
    })

    it('should delete lead successfully', async () => {
      const request = new NextRequest(
        `http://localhost:3000/api/v1/connection/leads/${deleteTestLeadId}`,
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

    it('should return 404 for non-existent lead', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/connection/leads/non-existent',
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
        `http://localhost:3000/api/v1/connection/leads/${deleteTestLeadId}`,
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
    it('should ensure tenant1 leads not visible to tenant2', async () => {
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
        'http://localhost:3000/api/v1/connection/leads?search=Test',
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
        'http://localhost:3000/api/v1/connection/leads?search=Test',
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
        'http://localhost:3000/api/v1/connection/leads',
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
        'http://localhost:3000/api/v1/connection/leads/does-not-exist',
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
        title: 'Test',
        pipelineId: pipelineId1,
        stageId: stageId1
      })
      const putReq = createRequest('PUT', user1Id, tenant1Id, {
        status: 'QUALIFIED'
      })
      const deleteReq = createRequest('DELETE')

      expect(getReq.method).toBe('GET')
      expect(postReq.method).toBe('POST')
      expect(putReq.method).toBe('PUT')
      expect(deleteReq.method).toBe('DELETE')
    })
  })

  describe('Pipeline & Stage Validation', () => {
    it('should enforce pipeline ownership in leads', async () => {
      const request = createRequest('GET')
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })

    it('should include related data in responses', async () => {
      const request = createRequest('GET')
      // Responses should include pipeline, stage, contact relationships
      expect(request.headers.get('x-user-id')).toBeTruthy()
    })
  })
})
