/**
 * Authentication Middleware
 * Verifies JWT tokens and extracts user information from requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { config } from '@/lib/config';

export interface AuthUser {
  userId: string;
  profileId: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER';
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
}

export interface AuthRequest extends NextRequest {
  user?: AuthUser;
}

/**
 * Extract and verify JWT token from request headers
 */
export function extractToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Verify JWT token and extract user data
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = verify(token, config.JWT_SECRET) as AuthUser;
    return payload;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Middleware to extract user from JWT token
 */
export async function withAuth(
  request: NextRequest,
  handler: (req: AuthRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const token = extractToken(request);

    if (!token) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Missing or invalid authorization token',
        },
        { status: 401 }
      );
    }

    const user = verifyToken(token);

    if (!user) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        },
        { status: 401 }
      );
    }

    // Attach user to request
    (request as AuthRequest).user = user;

    return handler(request as AuthRequest);
  } catch (error) {
    console.error('Auth middleware error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Authentication failed',
      },
      { status: 500 }
    );
  }
}

/**
 * Middleware to enforce role-based access control
 */
export function requireRole(...allowedRoles: AuthUser['role'][]) {
  return async (
    request: AuthRequest,
    handler: (req: AuthRequest) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    const user = request.user;

    if (!user) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'User information not found',
        },
        { status: 401 }
      );
    }

    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        },
        { status: 403 }
      );
    }

    return handler(request);
  };
}

/**
 * Compose multiple middleware functions
 */
export function compose(
  ...middlewares: Array<
    (
      req: AuthRequest,
      handler: (req: AuthRequest) => Promise<NextResponse>
    ) => Promise<NextResponse>
  >
) {
  return async (
    request: AuthRequest,
    handler: (req: AuthRequest) => Promise<NextResponse>
  ): Promise<NextResponse> => {
    let currentHandler = handler;

    // Compose middlewares in reverse order
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i];
      const nextHandler = currentHandler;
      currentHandler = (req) => middleware(req, nextHandler);
    }

    return currentHandler(request);
  };
}
