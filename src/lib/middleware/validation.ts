/**
 * Request Validation Middleware
 * Validates incoming request data with Zod schemas
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from './response';

/**
 * Validate request body against a schema
 */
export async function validateRequestBody<T extends z.ZodSchema>(
  request: NextRequest,
  schema: T
): Promise<{ valid: true; data: z.infer<T> } | { valid: false; error: string }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      const errors = result.error.issues
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      return { valid: false, error: errors };
    }

    return { valid: true, data: result.data };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid JSON in request body',
    };
  }
}

/**
 * Validate query parameters against a schema
 */
export function validateQueryParams<T extends z.ZodSchema>(
  params: Record<string, string | string[] | undefined>,
  schema: T
): { valid: true; data: z.infer<T> } | { valid: false; error: string } {
  const result = schema.safeParse(params);

  if (!result.success) {
    const errors = result.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('; ');
    return { valid: false, error: errors };
  }

  return { valid: true, data: result.data };
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  email: z.string().email('Invalid email format'),
  uuid: z.string().uuid('Invalid UUID format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  pagination: z.object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(10),
  }),
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
};

/**
 * Demo login request validation
 */
export const DemoLoginSchema = z.object({
  email: CommonSchemas.email,
});

/**
 * QR session generation validation
 */
export const QRSessionGenerateSchema = z.object({
  deviceInfo: z
    .object({
      userAgent: z.string().optional(),
      platform: z.string().optional(),
      browser: z.string().optional(),
    })
    .optional(),
});

/**
 * Contact creation/update validation
 */
export const ContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: CommonSchemas.email.optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
