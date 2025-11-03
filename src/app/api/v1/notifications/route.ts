/**
 * Notification Management API Routes
 * 
 * GET    /api/v1/notifications - Get user's notifications
 * POST   /api/v1/notifications - Send notification
 * PUT    /api/v1/notifications/:id - Mark notification as read
 * DELETE /api/v1/notifications/:id - Delete notification
 * POST   /api/v1/notifications/read-all - Mark all as read
 * GET    /api/v1/notifications/preferences - Get notification preferences
 * PUT    /api/v1/notifications/preferences - Update preferences
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logging';
import {
  sendNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  getUnreadCount,
  setNotificationPreference,
  getNotificationPreference,
  getAllPreferences,
  NotificationChannel,
  NotificationType,
} from '@/lib/notifications';

/**
 * Validation schemas
 */
const sendNotificationSchema = z.object({
  userId: z.string().min(1),
  type: z.nativeEnum(NotificationType),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  channels: z.array(z.nativeEnum(NotificationChannel)),
  data: z.record(z.string(), z.any()).optional(),
  actionUrl: z.string().url().optional(),
  actionLabel: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  tags: z.array(z.string()).optional(),
});

const preferenceSchema = z.object({
  type: z.nativeEnum(NotificationType),
  channels: z.record(z.string(), z.boolean()),
  enabled: z.boolean(),
  frequency: z.enum(['instant', 'daily', 'weekly', 'digest']).optional(),
});

/**
 * GET /api/v1/notifications
 * Get user's notifications
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Get tenant and user from context (would come from middleware)
    const tenantId = request.headers.get('x-tenant-id');
    const userId = request.headers.get('x-user-id');

    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 });
    }

    // Query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const unreadOnly = searchParams.get('unread') === 'true';
    const type = searchParams.get('type') as NotificationType | null;

    logger.debug(`Fetching notifications for user ${userId}`, {
      tenantId,
      limit,
      offset,
      unreadOnly,
    });

    const notifications = getNotifications(tenantId, userId, {
      limit,
      offset,
      unreadOnly,
      type: type || undefined,
    });

    const unreadCount = getUnreadCount(tenantId, userId);

    return NextResponse.json({
      success: true,
      data: notifications,
      pagination: {
        limit,
        offset,
        hasMore: notifications.length === limit,
      },
      unreadCount,
    });
  } catch (error) {
    logger.error('Error fetching notifications', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

/**
 * POST /api/v1/notifications
 * Send notification
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get('x-tenant-id');

    if (!tenantId) {
      return NextResponse.json({ error: 'Missing tenant ID' }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = sendNotificationSchema.parse(body);

    logger.debug(`Sending notification`, {
      tenantId,
      userId: validatedData.userId,
      type: validatedData.type,
    });

    const result = await sendNotification({
      tenantId,
      ...validatedData,
    });

    return NextResponse.json({
      success: result.success,
      channels: result.channels,
    });
  } catch (error) {
    logger.error('Error sending notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}

/**
 * PUT /api/v1/notifications/:id
 * Mark notification as read
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id');
    const userId = request.headers.get('x-user-id');

    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 });
    }

    const { id } = params;

    logger.debug(`Marking notification as read`, { tenantId, userId, notificationId: id });

    const success = markAsRead(tenantId, userId, id);

    if (!success) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/notifications/:id
 * Delete notification
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id');
    const userId = request.headers.get('x-user-id');

    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 });
    }

    const { id } = params;

    logger.debug(`Deleting notification`, { tenantId, userId, notificationId: id });

    const success = deleteNotification(tenantId, userId, id);

    if (!success) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
  }
}
