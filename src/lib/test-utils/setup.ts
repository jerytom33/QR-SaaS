/**
 * Test Setup and Configuration
 * Runs before all tests to set up the test environment
 */

import { beforeEach, afterEach, vi } from 'vitest'

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-min-32-chars'
process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-for-testing-only-32'
process.env.JWT_EXPIRES_IN = '15m'
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d'
process.env.QR_SESSION_EXPIRES_IN = '5m'
process.env.API_RATE_LIMIT = '100'
process.env.API_RATE_LIMIT_WINDOW = '900000'

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  vi.clearAllMocks()
})

afterEach(() => {
  // Cleanup after each test
  vi.clearAllTimers()
})

// Mock console methods to avoid noise in test output (optional)
global.console = {
  ...console,
  // Uncomment to suppress logs during tests:
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  error: console.error, // Keep error logs
  warn: console.warn, // Keep warnings
}
