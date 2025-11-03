/**
 * Tenant Context Middleware Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getTenantContextFromUser } from '../tenant-context'

describe('Tenant Context Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getTenantContextFromUser', () => {
    it('should extract tenant context from user object', () => {
      const user = {
        tenantId: 'tenant-456',
        role: 'TENANT_ADMIN',
      }

      const context = getTenantContextFromUser(user)

      expect(context).toBeDefined()
      expect(context.tenantId).toBe('tenant-456')
      expect(context.isSuperAdmin).toBe(false)
    })

    it('should identify super admins correctly', () => {
      const user = {
        tenantId: 'tenant-456',
        role: 'SUPER_ADMIN',
      }

      const context = getTenantContextFromUser(user)

      expect(context.isSuperAdmin).toBe(true)
    })

    it('should return false for non-super admin roles', () => {
      const tenantAdminUser = {
        tenantId: 'tenant-456',
        role: 'TENANT_ADMIN',
      }

      const regularUser = {
        tenantId: 'tenant-456',
        role: 'USER',
      }

      expect(getTenantContextFromUser(tenantAdminUser).isSuperAdmin).toBe(false)
      expect(getTenantContextFromUser(regularUser).isSuperAdmin).toBe(false)
    })

    it('should require tenantId', () => {
      const invalidUser = {
        tenantId: '',
        role: 'USER',
      }

      const context = getTenantContextFromUser(invalidUser)
      expect(context.tenantId).toBe('')
    })
  })

  describe('Multi-tenant isolation', () => {
    it('should isolate tenant data correctly', () => {
      const tenant1User = {
        tenantId: 'tenant-1',
        role: 'TENANT_ADMIN',
      }

      const tenant2User = {
        tenantId: 'tenant-2',
        role: 'TENANT_ADMIN',
      }

      const context1 = getTenantContextFromUser(tenant1User)
      const context2 = getTenantContextFromUser(tenant2User)

      expect(context1.tenantId).not.toBe(context2.tenantId)
      expect(context1.tenantId).toBe('tenant-1')
      expect(context2.tenantId).toBe('tenant-2')
    })
  })

  describe('User roles and permissions', () => {
    it('should identify different admin levels', () => {
      const superAdmin = {
        tenantId: 'tenant-1',
        role: 'SUPER_ADMIN',
      }

      const tenantAdmin = {
        tenantId: 'tenant-1',
        role: 'TENANT_ADMIN',
      }

      const superAdminContext = getTenantContextFromUser(superAdmin)
      const tenantAdminContext = getTenantContextFromUser(tenantAdmin)

      expect(superAdminContext.isSuperAdmin).toBe(true)
      expect(tenantAdminContext.isSuperAdmin).toBe(false)
    })

    it('should identify super admin regardless of tenant', () => {
      const superAdmin = {
        tenantId: 'any-tenant',
        role: 'SUPER_ADMIN',
      }

      const context = getTenantContextFromUser(superAdmin)

      expect(context.isSuperAdmin).toBe(true)
      expect(context.tenantId).toBe('any-tenant')
    })
  })

  describe('Context field validation', () => {
    it('should include all required fields in context', () => {
      const user = {
        tenantId: 'tenant-456',
        role: 'TENANT_ADMIN',
      }

      const context = getTenantContextFromUser(user)

      expect(context).toHaveProperty('tenantId')
      expect(context).toHaveProperty('isSuperAdmin')
    })

    it('should have correct field types', () => {
      const user = {
        tenantId: 'tenant-456',
        role: 'TENANT_ADMIN',
      }

      const context = getTenantContextFromUser(user)

      expect(typeof context.tenantId).toBe('string')
      expect(typeof context.isSuperAdmin).toBe('boolean')
    })
  })
})
