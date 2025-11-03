/**
 * Audit Logging
 * Tracks authentication and critical operations for compliance and debugging
 */

import { db } from '@/lib/db';

export enum AuditAction {
  // Authentication
  LOGIN_DEMO = 'LOGIN_DEMO',
  LOGIN_QR = 'LOGIN_QR',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',

  // QR Sessions
  QR_SESSION_CREATED = 'QR_SESSION_CREATED',
  QR_SESSION_SCANNED = 'QR_SESSION_SCANNED',
  QR_SESSION_LINKED = 'QR_SESSION_LINKED',
  QR_SESSION_EXPIRED = 'QR_SESSION_EXPIRED',

  // Contacts
  CONTACT_CREATED = 'CONTACT_CREATED',
  CONTACT_UPDATED = 'CONTACT_UPDATED',
  CONTACT_DELETED = 'CONTACT_DELETED',

  // Admin
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  TENANT_CREATED = 'TENANT_CREATED',
  TENANT_UPDATED = 'TENANT_UPDATED',
}

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  resourceId?: string;
  resourceType?: string;
  status: 'success' | 'failure';
  statusCode?: number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  error?: string;
}

/**
 * Log an audit entry
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    console.log('[AUDIT]', {
      timestamp: new Date().toISOString(),
      ...entry,
    });

    // TODO: Store in database when audit log table is added to schema
    // await db.auditLog.create({
    //   data: {
    //     action: entry.action,
    //     userId: entry.userId,
    //     userEmail: entry.userEmail,
    //     tenantId: entry.tenantId,
    //     resourceId: entry.resourceId,
    //     resourceType: entry.resourceType,
    //     status: entry.status,
    //     statusCode: entry.statusCode,
    //     details: entry.details,
    //     ipAddress: entry.ipAddress,
    //     userAgent: entry.userAgent,
    //     error: entry.error,
    //     createdAt: new Date(),
    //   },
    // });
  } catch (error) {
    console.error('Audit logging failed:', error);
    // Don't throw - audit logging failures shouldn't break the application
  }
}

/**
 * Extract request metadata for audit logging
 */
export function extractRequestMetadata(request: Request) {
  return {
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

/**
 * Log authentication attempt
 */
export async function logAuthAttempt(
  email: string,
  success: boolean,
  method: 'DEMO' | 'QR',
  error?: string
): Promise<void> {
  await logAudit({
    action: success
      ? method === 'DEMO'
        ? AuditAction.LOGIN_DEMO
        : AuditAction.LOGIN_QR
      : AuditAction.LOGIN_FAILED,
    userEmail: email,
    status: success ? 'success' : 'failure',
    error,
  });
}
