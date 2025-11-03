/**
 * Common Test Utilities
 * Helpers for creating test data and mocking HTTP requests
 */

import { NextRequest } from 'next/server'
import { vi } from 'vitest'

/**
 * Create a mock NextRequest object
 */
export function createMockRequest(
  options: {
    url?: string
    method?: string
    headers?: Record<string, string>
    body?: any
  } = {}
) {
  const {
    url = 'http://localhost:3000/api/test',
    method = 'GET',
    headers = {},
    body = null,
  } = options

  const mockHeaders = new Map(Object.entries(headers))

  return {
    url: new URL(url),
    method,
    headers: {
      get: (name: string) => mockHeaders.get(name.toLowerCase()),
      has: (name: string) => mockHeaders.has(name.toLowerCase()),
      entries: () => mockHeaders.entries(),
    },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    clone: () => createMockRequest(options),
  } as unknown as NextRequest
}

/**
 * Create a JWT token for testing
 */
export function createMockJWT(
  payload: Record<string, any> = {},
  secret: string = 'test-secret-key-for-testing-only-min-32-chars'
): string {
  // Base64 encode header
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')

  // Base64 encode payload
  const defaultPayload = {
    userId: 'user-1',
    email: 'test@example.com',
    tenantId: 'tenant-1',
    role: 'USER',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  }
  const encodedPayload = Buffer.from(JSON.stringify(defaultPayload)).toString('base64')

  // For testing purposes, just create a fake signature
  const signature = Buffer.from('fake-signature').toString('base64')

  return `${header}.${encodedPayload}.${signature}`
}

/**
 * Create mock auth context
 */
export function createMockAuthContext(overrides = {}) {
  return {
    userId: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    tenantId: 'tenant-1',
    role: 'USER',
    ...overrides,
  }
}

/**
 * Create mock request with auth header
 */
export function createAuthenticatedRequest(
  options: any = {},
  authPayload: Record<string, any> = {}
) {
  const token = createMockJWT(authPayload)
  return createMockRequest({
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  })
}

/**
 * Mock crypto.randomUUID for testing
 */
export function mockUUID(id: string = 'test-uuid-1234567890') {
  vi.stubGlobal('crypto', {
    randomUUID: () => id,
  })
}

/**
 * Sleep for a specified time (useful for async tests)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Create mock validation error
 */
export function createMockValidationError(errors: Record<string, string> = {}) {
  return {
    success: false,
    error: 'Validation Error',
    details: errors,
  }
}
