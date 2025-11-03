/**
 * Notification Preferences API Route
 * 
 * GET    /api/v1/notifications/preferences - Get all preferences
 * PUT    /api/v1/notifications/preferences/:type - Update specific preference
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logging';
import {
  setNotificationPreference,
  getAllPreferences,
  NotificationChannel,
  NotificationType,
} from '@/lib/notifications';

const updatePreferenceSchema = z.object({
  channels: z.record(z.string(), z.boolean()),
  enabled: z.boolean(),
  frequency: z.enum(['instant', 'daily', 'weekly', 'digest']).optional(),
});

/**
 * GET /api/v1/notifications/preferences
 * Get all notification preferences for user
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get('x-tenant-id');
    const userId = request.headers.get('x-user-id');

    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 });
    }

    logger.debug(`Fetching notification preferences for user ${userId}`, { tenantId });

    const preferences = getAllPreferences(tenantId, userId);

    return NextResponse.json({
      success: true,
      data: preferences,
      count: preferences.length,
    });
  } catch (error) {
    logger.error('Error fetching notification preferences', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/notifications/preferences/:type
 * Update notification preference for specific type
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { type: string } }
) {
  try {
    const tenantId = request.headers.get('x-tenant-id');
    const userId = request.headers.get('x-user-id');

    if (!tenantId || !userId) {
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 });
    }

    const { type } = params;

    // Validate notification type
    if (!Object.values(NotificationType).includes(type as NotificationType)) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = updatePreferenceSchema.parse(body);

    logger.debug(`Updating notification preference`, {
      tenantId,
      userId,
      type,
    });

    setNotificationPreference({
      userId,
      tenantId,
      type: type as NotificationType,
      ...validatedData,
    });

    return NextResponse.json({
      success: true,
      message: `Preference updated for ${type}`,
    });
  } catch (error) {
    logger.error('Error updating notification preference', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update notification preference' },
      { status: 500 }
    );
  }
}
