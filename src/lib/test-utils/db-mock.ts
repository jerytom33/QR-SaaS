/**
 * Database Mocks and Utilities
 * Provides mock database objects and helpers for testing
 */

import { vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Create a mocked Prisma client for testing
 */
export function createMockPrismaClient() {
  const mockPrisma = {
    tenant: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    profile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    company: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    lead: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    apiKey: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    qRSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    linkedDevice: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
  }

  return mockPrisma
}

/**
 * Reset all mock functions
 */
export function resetAllMocks(mockPrisma: any) {
  Object.values(mockPrisma).forEach((table: any) => {
    if (table && typeof table === 'object') {
      Object.values(table).forEach((fn: any) => {
        if (typeof fn === 'function' && fn.mockReset) {
          fn.mockReset()
        }
      })
    }
  })
}

/**
 * Create mock tenant data
 */
export function createMockTenant(overrides = {}) {
  return {
    id: 'tenant-1',
    name: 'Test Tenant',
    slug: 'test-tenant',
    domain: 'test.example.com',
    status: 'ACTIVE' as const,
    plan: 'PROFESSIONAL' as const,
    maxUsers: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/**
 * Create mock profile (user) data
 */
export function createMockProfile(overrides = {}) {
  return {
    id: 'profile-1',
    userId: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    role: 'USER' as const,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: 'tenant-1',
    ...overrides,
  }
}

/**
 * Create mock contact data
 */
export function createMockContact(overrides = {}) {
  return {
    id: 'contact-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    avatar: null,
    title: 'CEO',
    department: 'Executive',
    notes: 'Test contact',
    tags: JSON.stringify(['vip']),
    customFields: JSON.stringify({}),
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: 'tenant-1',
    companyId: null,
    ...overrides,
  }
}

/**
 * Create mock QR session data
 */
export function createMockQRSession(overrides = {}) {
  return {
    id: 'qr-session-1',
    status: 'PENDING' as const,
    qrCodeData: 'data:image/png;base64,...',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    linkedToken: null,
    deviceInfo: 'Test Device',
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: 'tenant-1',
    ...overrides,
  }
}

/**
 * Create mock API key data
 */
export function createMockApiKey(overrides = {}) {
  return {
    id: 'apikey-1',
    name: 'Test API Key',
    keyHash: 'hashed-key',
    keyPrefix: 'sk_test_',
    permissions: JSON.stringify(['read:contacts', 'write:contacts']),
    isActive: true,
    lastUsedAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenantId: 'tenant-1',
    createdBy: 'profile-1',
    ...overrides,
  }
}

/**
 * Mock transaction function for Prisma $transaction
 */
export async function mockTransaction<T>(
  callback: (tx: any) => Promise<T>,
  mockPrisma: any
): Promise<T> {
  return callback(mockPrisma)
}
