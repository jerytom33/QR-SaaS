/**
 * Demo Login API Route
 * Authenticates demo accounts without passwords for development/demo purposes
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sign, SignOptions } from 'jsonwebtoken';
import { config } from '@/lib/config';
import { validateRequestBody, DemoLoginSchema } from '@/lib/middleware/validation';
import { successResponse, errorResponse } from '@/lib/middleware/response';
import { logAuthAttempt } from '@/lib/audit';
import { loginRateLimiter } from '@/lib/middleware/rate-limit';

export async function POST(request: NextRequest) {
  // Apply rate limiting for login attempts
  const rateLimitResult = await loginRateLimiter(request);
  if (rateLimitResult) return rateLimitResult;

  try {
    // Validate request body
    const validation = await validateRequestBody(request, DemoLoginSchema);
    if (!validation.valid) {
      await logAuthAttempt('unknown', false, 'DEMO', validation.error);
      return errorResponse('Validation Error', validation.error, 400);
    }

    const { email } = validation.data;

    // Find user profile by email
    const profile = await db.profile.findFirst({
      where: {
        email: email.toLowerCase(),
        isActive: true,
      },
      include: {
        tenant: true,
      },
    });

    if (!profile) {
      await logAuthAttempt(email, false, 'DEMO', 'Demo account not found');
      return errorResponse('Not Found', 'Demo account not found', 404);
    }

    // Create JWT payload
    const payload = {
      userId: profile.userId,
      profileId: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
      tenantId: profile.tenantId,
      tenantSlug: profile.tenant.slug,
      tenantName: profile.tenant.name,
    };

    // Generate JWT token
    const accessToken = sign(
      payload,
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN } as SignOptions
    );

    // Generate refresh token (long-lived)
    const refreshToken = sign(
      { userId: profile.userId, profileId: profile.id },
      config.JWT_SECRET,
      { expiresIn: config.REFRESH_TOKEN_EXPIRES_IN } as SignOptions
    );

    // Update last login
    await db.profile.update({
      where: { id: profile.id },
      data: { lastLoginAt: new Date() },
    });

    // Log successful authentication
    await logAuthAttempt(email, true, 'DEMO');

    // Return success response
    return successResponse(
      {
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          tenant: {
            id: profile.tenant.id,
            name: profile.tenant.name,
            slug: profile.tenant.slug,
            plan: profile.tenant.plan,
          },
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
      'Login successful'
    );
  } catch (error) {
    console.error('Demo login error:', error);
    await logAuthAttempt(
      'unknown',
      false,
      'DEMO',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return errorResponse(
      'Internal Server Error',
      'Authentication failed',
      500
    );
  }
}

// Get demo accounts list
export async function GET() {
  try {
    const demoAccounts = await db.profile.findMany({
      where: {
        isActive: true,
        email: {
          contains: '@demo.com',
        },
      },
      select: {
        email: true,
        name: true,
        role: true,
        tenant: {
          select: {
            name: true,
            slug: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { email: 'asc' },
      ],
    });

    return successResponse(
      { accounts: demoAccounts },
      'Demo accounts retrieved successfully'
    );
  } catch (error) {
    console.error('Error fetching demo accounts:', error);
    return errorResponse(
      'Internal Server Error',
      'Failed to fetch demo accounts',
      500
    );
  }
}