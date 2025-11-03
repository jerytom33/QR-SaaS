/**
 * Tenant Context Middleware for RLS
 * Sets the PostgreSQL session variable for tenant isolation
 */

import { PrismaClient } from '@prisma/client';

export interface TenantContext {
  tenantId: string | null;
  isSuperAdmin?: boolean;
}

/**
 * Middleware to set tenant context for RLS
 * This must be called before any database operation
 */
export function createTenantMiddleware(prisma: PrismaClient) {
  return async (tenantContext: TenantContext, next: () => Promise<any>) => {
    const { tenantId, isSuperAdmin = false } = tenantContext;

    // Set session variables for RLS
    const setContextQueries: Promise<number>[] = [];

    if (tenantId) {
      setContextQueries.push(
        prisma.$executeRawUnsafe(
          `SET LOCAL app.current_tenant_id = '${tenantId.replace(/'/g, "''")}'`
        )
      );
    } else {
      // Clear tenant context (will result in no access unless super admin)
      setContextQueries.push(
        prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = ''`)
      );
    }

    if (isSuperAdmin) {
      setContextQueries.push(
        prisma.$executeRawUnsafe(`SET LOCAL app.is_super_admin = 'true'`)
      );
    } else {
      setContextQueries.push(
        prisma.$executeRawUnsafe(`SET LOCAL app.is_super_admin = 'false'`)
      );
    }

    // Execute context setting queries
    await Promise.all(setContextQueries);

    // Execute the actual query
    return next();
  };
}

/**
 * Execute a database operation with tenant context
 * Wraps the operation in a transaction to ensure RLS is applied
 */
export async function withTenantContext<T>(
  prisma: PrismaClient,
  tenantContext: TenantContext,
  operation: (tx: any) => Promise<T>
): Promise<T> {
  return await prisma.$transaction(async (tx) => {
    const { tenantId, isSuperAdmin = false } = tenantContext;

    // Set session variables for RLS
    if (tenantId) {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${tenantId.replace(/'/g, "''")}'`
      );
    } else {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = ''`);
    }

    if (isSuperAdmin) {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_super_admin = 'true'`);
    } else {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_super_admin = 'false'`);
    }

    // Execute the operation with the transaction client
    return await operation(tx);
  });
}

/**
 * Helper to extract tenant context from request
 * Use this in API routes to get tenant info from JWT
 */
export function getTenantContextFromUser(user: {
  tenantId: string;
  role: string;
}): TenantContext {
  return {
    tenantId: user.tenantId,
    isSuperAdmin: user.role === 'SUPER_ADMIN',
  };
}

/**
 * Phase 1.1 Enhancement: Direct RLS context setting functions
 * These provide lower-level control for the migration to RLS
 */

/**
 * Set tenant context using the RLS function directly
 * Called from set_tenant_context SQL function
 */
export async function setTenantContextRLS(
  prisma: PrismaClient,
  tenantId: string
): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT set_tenant_context(${tenantId})`;
  } catch (error) {
    console.error('Failed to set tenant context via RLS function:', error);
    throw error;
  }
}

/**
 * Get current tenant from RLS context
 */
export async function getTenantContextRLS(
  prisma: PrismaClient
): Promise<string | null> {
  try {
    const result = await prisma.$queryRaw<[{ get_tenant_id: string | null }]>`
      SELECT get_tenant_id() as get_tenant_id
    `;
    return result?.[0]?.get_tenant_id || null;
  } catch (error) {
    console.error('Failed to get tenant context via RLS function:', error);
    return null;
  }
}

/**
 * Validate tenant access before operation
 * Double-checks that user is authorized for the requested tenant
 */
export function validateTenantAccess(
  requestedTenantId: string,
  authorizedTenantIds: string[]
): boolean {
  return authorizedTenantIds.includes(requestedTenantId);
}

/**
 * Extract tenant ID from various sources
 * Priority: Header > Subdomain > Cookie
 */
export function extractTenantIdFromRequest(request: {
  headers?: Record<string, string>;
  hostname?: string;
  cookies?: Record<string, string>;
}): string | null {
  // 1. Check custom header
  if (request.headers?.['x-tenant-id']) {
    return request.headers['x-tenant-id'];
  }

  // 2. Check subdomain
  if (request.hostname) {
    const subdomainMatch = request.hostname.match(
      /^([a-zA-Z0-9-]+)\.example\.com$/
    );
    if (subdomainMatch && subdomainMatch[1] !== 'www') {
      return subdomainMatch[1];
    }
  }

  // 3. Check cookie
  if (request.cookies?.['x-tenant-id']) {
    return request.cookies['x-tenant-id'];
  }

  return null;
}

/**
 * Example usage in an API route:
 * 
 * import { withTenantContext, getTenantContextFromUser } from '@/lib/middleware/tenant-context';
 * import { db } from '@/lib/db';
 * 
 * export async function GET(request: NextRequest) {
 *   const user = await getAuthUser(request);
 *   const tenantContext = getTenantContextFromUser(user);
 * 
 *   const contacts = await withTenantContext(db, tenantContext, async (tx) => {
 *     return await tx.contact.findMany();
 *   });
 * 
 *   return NextResponse.json(contacts);
 * }
 */
