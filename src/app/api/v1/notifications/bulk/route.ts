/**
 * Notification Bulk Operations API Route
 * 
 * POST /api/v1/notifications/read-all - Mark all notifications as read
 * POST /api/v1/notifications/clear - Clear all notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { markAllAsRead, clearNotifications } from '@/lib/notifications';

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read for user
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { action: string } }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id');
    const userId = request.headers.get('x-user-id');

    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 });
    }

    const { action } = params;

    if (action === 'read-all') {
      logger.debug(`Marking all notifications as read`, { tenantId, userId });

      const count = markAllAsRead(tenantId, userId);

      return NextResponse.json({
        success: true,
        message: `Marked ${count} notification(s) as read`,
        updatedCount: count,
      });
    }

    if (action === 'clear') {
      logger.debug(`Clearing all notifications`, { tenantId, userId });

      const count = clearNotifications(tenantId, userId);

      return NextResponse.json({
        success: true,
        message: `Cleared ${count} notification(s)`,
        clearedCount: count,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error('Error performing bulk notification operation', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to perform operation' }, { status: 500 });
  }
}
