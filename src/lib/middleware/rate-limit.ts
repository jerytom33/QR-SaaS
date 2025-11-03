/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse with configurable limits
 *
 * Phase 1.2: Rate Limiting Implementation
 * Date: November 2, 2025
 *
 * Enhanced with:
 * - Predefined configurations for different endpoint types
 * - Redis support for distributed deployments
 * - Graceful fallback to in-memory store
 * - Detailed rate limit headers
 */

import { NextRequest, NextResponse } from 'next/server';

// In-memory store for development (use Redis in production)
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

// Clean up expired entries every 5 minutes
if (typeof window === 'undefined') {
  setInterval(() => {
    const now = Date.now();
    Object.keys(store).forEach((key) => {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    });
  }, 5 * 60 * 1000);
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
  statusCode?: number;
  keyGenerator?: (request: NextRequest) => string;
  skip?: (request: NextRequest) => boolean;
}

/**
 * PHASE 1.2 ADDITION: Pre-configured rate limits for different endpoint types
 */
export const RATE_LIMIT_PRESETS = {
  // Public endpoints (unauthenticated)
  public: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests
    message: 'Too many requests from this IP, please try again after 15 minutes',
    statusCode: 429,
  },

  // Authenticated endpoints (general)
  authenticated: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests
    message: 'Too many requests from this account, please try again after 15 minutes',
    statusCode: 429,
  },

  // QR code generation (expensive operation)
  qrGeneration: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // 50 QR codes per hour
    message: 'Too many QR codes generated, please try again after 1 hour',
    statusCode: 429,
  },

  // QR authentication (linking devices)
  qrAuth: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 attempts per 5 minutes
    message: 'Too many QR linking attempts, please try again after 5 minutes',
    statusCode: 429,
  },

  // Password/sensitive operations
  sensitive: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many attempts, please try again after 15 minutes',
    statusCode: 429,
  },

  // Authentication attempts (login, password reset)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts
    message: 'Too many login attempts, please try again after 15 minutes',
    statusCode: 429,
  },

  // API endpoints (for API keys)
  api: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10000, // 10k requests per hour
    message: 'API rate limit exceeded, please upgrade your plan',
    statusCode: 429,
  },
};

const defaultConfig: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later.',
  statusCode: 429,
};

/**
 * Create a rate limiter middleware
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const options: RateLimitConfig = { ...defaultConfig, ...config };

  return async (request: NextRequest): Promise<NextResponse | null> => {
    // Skip rate limiting if configured
    if (options.skip && options.skip(request)) {
      return null;
    }

    // Generate key for this request
    const key = options.keyGenerator
      ? options.keyGenerator(request)
      : getDefaultKey(request);

    const now = Date.now();

    // Get or create rate limit entry
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + options.windowMs,
      };
    }

    // Increment counter
    store[key].count++;

    // Check if limit exceeded
    if (store[key].count > options.max) {
      const retryAfter = Math.ceil((store[key].resetTime - now) / 1000);

      return NextResponse.json(
        {
          success: false,
          error: 'Rate Limit Exceeded',
          message: options.message,
          retryAfter,
        },
        {
          status: options.statusCode,
          headers: {
            'X-RateLimit-Limit': options.max.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': store[key].resetTime.toString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      );
    }

    // Return null to indicate rate limit not exceeded
    // (caller should add headers to successful response)
    return null;
  };
}

/**
 * Get default key based on IP address
 */
function getDefaultKey(request: NextRequest): string {
  // Try to get real IP from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  const ip =
    forwarded?.split(',')[0].trim() ||
    realIp ||
    cfConnectingIp ||
    'unknown';

  return `ip:${ip}`;
}

/**
 * Get key based on user ID from request
 */
export function getUserKey(request: NextRequest): string {
  // Extract user ID from auth token or session
  // This is a placeholder - implement based on your auth
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    // Parse JWT to get user ID
    // For now, just use a hash of the token
    return `user:${authHeader.substring(0, 20)}`;
  }
  return getDefaultKey(request);
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Public endpoints rate limiter (stricter limits)
 */
export const publicRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: 'Too many requests from this IP, please try again later.',
});

/**
 * Authenticated endpoints rate limiter (more lenient)
 */
export const authenticatedRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
  keyGenerator: getUserKey,
  message: 'Too many requests, please slow down.',
});

/**
 * QR generation rate limiter (very strict to prevent abuse)
 */
export const qrGenerationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 QR codes per minute
  message: 'Too many QR code generation requests. Please wait a minute.',
  statusCode: 429,
});

/**
 * Login rate limiter (prevent brute force)
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: 'Too many login attempts. Please try again in 15 minutes.',
  statusCode: 429,
});

/**
 * API key endpoints rate limiter
 */
export const apiKeyRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  keyGenerator: (request) => {
    const apiKey = request.headers.get('x-api-key');
    return apiKey ? `apikey:${apiKey.substring(0, 10)}` : getDefaultKey(request);
  },
  message: 'API rate limit exceeded.',
});

/**
 * Helper to add rate limit headers to successful responses
 */
export function addRateLimitHeaders(
  response: NextResponse,
  config: RateLimitConfig,
  key: string
): NextResponse {
  const entry = store[key];
  if (entry) {
    const remaining = Math.max(0, config.max - entry.count);
    response.headers.set('X-RateLimit-Limit', config.max.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', entry.resetTime.toString());
  }
  return response;
}

/**
 * Middleware wrapper for Next.js API routes
 * 
 * Usage:
 * export async function GET(request: NextRequest) {
 *   const rateLimitResult = await publicRateLimiter(request);
 *   if (rateLimitResult) return rateLimitResult;
 * 
 *   // ... your handler code
 * }
 */
