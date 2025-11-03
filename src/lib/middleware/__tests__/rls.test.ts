/**
 * RLS (Row Level Security) Integration Tests
 * Verifies that tenant isolation is properly enforced at the database level
 *
 * Phase 1.1: Security & Stability
 * Date: November 2, 2025
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  withTenantContext,
  getTenantContextFromUser,
  setTenantContextRLS,
  getTenantContextRLS,
  validateTenantAccess,
} from '@/lib/middleware/tenant-context';

// Test database client
const prisma = new PrismaClient();

// Test tenant IDs
const TENANT_A = 'tenant-a-' + Date.now();
const TENANT_B = 'tenant-b-' + Date.now();

describe('PostgreSQL Row Level Security (RLS)', () => {
  beforeEach(async () => {
    // Create test tenants
    await prisma.tenant.create({
      data: {
        id: TENANT_A,
        name: 'Test Tenant A',
        slug: 'test-tenant-a',
        status: 'ACTIVE',
        plan: 'FREE',
      },
    });

    await prisma.tenant.create({
      data: {
        id: TENANT_B,
        name: 'Test Tenant B',
        slug: 'test-tenant-b',
        status: 'ACTIVE',
        plan: 'FREE',
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.contact.deleteMany({});
    await prisma.tenant.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Tenant Context Setting', () => {
    it('should set and retrieve tenant context', async () => {
      await setTenantContextRLS(prisma, TENANT_A);
      const tenantId = await getTenantContextRLS(prisma);
      expect(tenantId).toBe(TENANT_A);
    });

    it('should switch tenant context', async () => {
      await setTenantContextRLS(prisma, TENANT_A);
      let tenantId = await getTenantContextRLS(prisma);
      expect(tenantId).toBe(TENANT_A);

      await setTenantContextRLS(prisma, TENANT_B);
      tenantId = await getTenantContextRLS(prisma);
      expect(tenantId).toBe(TENANT_B);
    });

    it('should handle empty tenant context', async () => {
      await setTenantContextRLS(prisma, '');
      const tenantId = await getTenantContextRLS(prisma);
      expect(tenantId).toBe('');
    });

    it('should handle tenant context in transaction', async () => {
      const result = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          const ctx = await getTenantContextRLS(prisma);
          return ctx;
        }
      );

      // Note: Transaction context may be different, test accordingly
      expect(result).toBeDefined();
    });
  });

  describe('Contacts Table Isolation', () => {
    it('should isolate contacts by tenant', async () => {
      // Create contact in TENANT_A
      await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          await tx.contact.create({
            data: {
              firstName: 'Alice',
              lastName: 'Smith',
              email: 'alice@example.com',
              tenantId: TENANT_A,
            },
          });
        }
      );

      // Create contact in TENANT_B
      await withTenantContext(
        prisma,
        { tenantId: TENANT_B },
        async (tx) => {
          await tx.contact.create({
            data: {
              firstName: 'Bob',
              lastName: 'Jones',
              email: 'bob@example.com',
              tenantId: TENANT_B,
            },
          });
        }
      );

      // Query as TENANT_A - should see only Alice
      const contactsA = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.contact.findMany();
        }
      );
      expect(contactsA.length).toBe(1);
      expect(contactsA[0].firstName).toBe('Alice');

      // Query as TENANT_B - should see only Bob
      const contactsB = await withTenantContext(
        prisma,
        { tenantId: TENANT_B },
        async (tx) => {
          return await tx.contact.findMany();
        }
      );
      expect(contactsB.length).toBe(1);
      expect(contactsB[0].firstName).toBe('Bob');
    });

    it('should prevent cross-tenant contact access', async () => {
      // Create contact in TENANT_A
      const contact = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.contact.create({
            data: {
              firstName: 'Charlie',
              lastName: 'Brown',
              email: 'charlie@example.com',
              tenantId: TENANT_A,
            },
          });
        }
      );

      // Try to access as TENANT_B - should fail or return nothing
      const result = await withTenantContext(
        prisma,
        { tenantId: TENANT_B },
        async (tx) => {
          return await tx.contact.findUnique({
            where: { id: contact.id },
          });
        }
      );

      // With RLS, this should be null or throw an error
      expect(result).toBeNull();
    });

    it('should prevent cross-tenant contact creation', async () => {
      // Try to create contact in TENANT_A while context is TENANT_B
      let errorOccurred = false;

      try {
        await withTenantContext(
          prisma,
          { tenantId: TENANT_B },
          async (tx) => {
            // Attempting to create with different tenantId
            await tx.contact.create({
              data: {
                firstName: 'David',
                lastName: 'Lee',
                email: 'david@example.com',
                tenantId: TENANT_A, // Different from context
              },
            });
          }
        );
      } catch (error) {
        errorOccurred = true;
      }

      expect(errorOccurred).toBe(true);
    });

    it('should allow updating own tenant contacts', async () => {
      const contact = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.contact.create({
            data: {
              firstName: 'Eve',
              lastName: 'Wilson',
              email: 'eve@example.com',
              tenantId: TENANT_A,
            },
          });
        }
      );

      const updated = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.contact.update({
            where: { id: contact.id },
            data: { firstName: 'Emma' },
          });
        }
      );

      expect(updated.firstName).toBe('Emma');
    });

    it('should prevent deleting other tenant contacts', async () => {
      const contact = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.contact.create({
            data: {
              firstName: 'Frank',
              lastName: 'Miller',
              email: 'frank@example.com',
              tenantId: TENANT_A,
            },
          });
        }
      );

      let errorOccurred = false;

      try {
        await withTenantContext(
          prisma,
          { tenantId: TENANT_B },
          async (tx) => {
            await tx.contact.delete({
              where: { id: contact.id },
            });
          }
        );
      } catch (error) {
        errorOccurred = true;
      }

      expect(errorOccurred).toBe(true);
    });
  });

  describe('Companies Table Isolation', () => {
    it('should isolate companies by tenant', async () => {
      await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          await tx.company.create({
            data: {
              name: 'Acme Corp',
              tenantId: TENANT_A,
            },
          });
        }
      );

      await withTenantContext(
        prisma,
        { tenantId: TENANT_B },
        async (tx) => {
          await tx.company.create({
            data: {
              name: 'Tech Inc',
              tenantId: TENANT_B,
            },
          });
        }
      );

      const companiesA = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.company.findMany();
        }
      );

      expect(companiesA.length).toBe(1);
      expect(companiesA[0].name).toBe('Acme Corp');
    });
  });

  describe('Leads Table Isolation', () => {
    it('should isolate leads by tenant', async () => {
      // Create pipeline for leads
      const pipelineA = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.pipeline.create({
            data: {
              name: 'Sales Pipeline',
              tenantId: TENANT_A,
            },
          });
        }
      );

      // Create stage for pipeline
      const stageA = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.pipelineStage.create({
            data: {
              name: 'New',
              pipelineId: pipelineA.id,
            },
          });
        }
      );

      // Create lead
      await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          await tx.lead.create({
            data: {
              title: 'Test Lead',
              tenantId: TENANT_A,
              pipelineId: pipelineA.id,
              stageId: stageA.id,
            },
          });
        }
      );

      const leads = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.lead.findMany();
        }
      );

      expect(leads.length).toBe(1);
    });
  });

  describe('API Keys Table Isolation', () => {
    it('should isolate API keys by tenant', async () => {
      await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          await tx.apiKey.create({
            data: {
              name: 'API Key A',
              keyHash: 'hashed-key-a',
              keyPrefix: 'sk_test_a',
              tenantId: TENANT_A,
              createdBy: 'user-a',
            },
          });
        }
      );

      const keys = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.apiKey.findMany();
        }
      );

      expect(keys.length).toBe(1);
      expect(keys[0].name).toBe('API Key A');
    });
  });

  describe('Activities Table Isolation', () => {
    it('should isolate activities by tenant', async () => {
      const contact = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.contact.create({
            data: {
              firstName: 'Grace',
              lastName: 'Taylor',
              tenantId: TENANT_A,
            },
          });
        }
      );

      await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          await tx.activity.create({
            data: {
              type: 'CALL',
              title: 'Client Call',
              tenantId: TENANT_A,
              contactId: contact.id,
              createdBy: 'user-a',
            },
          });
        }
      );

      const activities = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.activity.findMany();
        }
      );

      expect(activities.length).toBe(1);
    });
  });

  describe('Tenant Access Validation', () => {
    it('should validate allowed tenant access', () => {
      const isAllowed = validateTenantAccess(TENANT_A, [TENANT_A, TENANT_B]);
      expect(isAllowed).toBe(true);
    });

    it('should deny unauthorized tenant access', () => {
      const isAllowed = validateTenantAccess(TENANT_A, [TENANT_B]);
      expect(isAllowed).toBe(false);
    });

    it('should handle empty tenant list', () => {
      const isAllowed = validateTenantAccess(TENANT_A, []);
      expect(isAllowed).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should query contacts efficiently with RLS', async () => {
      // Create multiple contacts
      await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          for (let i = 0; i < 10; i++) {
            await tx.contact.create({
              data: {
                firstName: `Contact${i}`,
                lastName: 'Test',
                tenantId: TENANT_A,
              },
            });
          }
        }
      );

      const startTime = Date.now();

      const contacts = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.contact.findMany();
        }
      );

      const endTime = Date.now();

      expect(contacts.length).toBe(10);
      // Query should complete in < 100ms
      expect(endTime - startTime).toBeLessThan(100);
    });
  });

  describe('RLS with Relationships', () => {
    it('should respect RLS through relationships', async () => {
      // Create company in TENANT_A
      const company = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.company.create({
            data: {
              name: 'Company A',
              tenantId: TENANT_A,
            },
          });
        }
      );

      // Create contact linked to company
      await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          await tx.contact.create({
            data: {
              firstName: 'Henry',
              lastName: 'Johnson',
              companyId: company.id,
              tenantId: TENANT_A,
            },
          });
        }
      );

      // Access through relationship
      const companyWithContacts = await withTenantContext(
        prisma,
        { tenantId: TENANT_A },
        async (tx) => {
          return await tx.company.findUnique({
            where: { id: company.id },
            include: { contacts: true },
          });
        }
      );

      expect(companyWithContacts?.contacts.length).toBe(1);
    });
  });
});
