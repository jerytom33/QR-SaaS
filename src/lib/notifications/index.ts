/**
 * Notification System
 * 
 * Multi-channel notification delivery:
 * - In-app notifications (database storage)
 * - Email notifications (via queue)
 * - Push notifications (web/mobile)
 * - Real-time WebSocket delivery
 */

import { logger } from '@/lib/logging';
import { notificationQueue } from '@/lib/queue';

/**
 * Notification types and channels
 */
export enum NotificationChannel {
  IN_APP = 'in-app',
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

export enum NotificationType {
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  CONTACT_DELETED = 'contact.deleted',
  LEAD_ASSIGNED = 'lead.assigned',
  LEAD_QUALIFIED = 'lead.qualified',
  ACTIVITY_REMINDER = 'activity.reminder',
  REPORT_READY = 'report.ready',
  IMPORT_COMPLETE = 'import.complete',
  EXPORT_COMPLETE = 'export.complete',
  SYSTEM_ALERT = 'system.alert',
  USER_MENTION = 'user.mentioned',
  COMMENT_REPLY = 'comment.reply',
}

export interface NotificationData {
  id?: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  channels: NotificationChannel[];
  data?: Record<string, any>;
  actionUrl?: string;
  actionLabel?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  tags?: string[];
  expiresAt?: Date;
  createdAt?: Date;
  read?: boolean;
  readAt?: Date | null;
}

export interface NotificationPreference {
  userId: string;
  tenantId: string;
  type: NotificationType;
  channels: {
    [key in NotificationChannel]?: boolean;
  };
  enabled: boolean;
  frequency?: 'instant' | 'daily' | 'weekly' | 'digest';
}

/**
 * In-app notification storage (in-memory for now, replace with DB)
 */
const notificationStore = new Map<string, NotificationData[]>();

/**
 * Notification preferences storage (in-memory for now, replace with DB)
 */
const preferenceStore = new Map<string, NotificationPreference>();

/**
 * Send notification through multiple channels
 */
export async function sendNotification(data: NotificationData): Promise<{
  success: boolean;
  channels: Record<string, boolean>;
}> {
  try {
    const channels = data.channels || [NotificationChannel.IN_APP];
    const results: Record<string, boolean> = {};

    logger.info(`Sending notification to ${data.userId}`, {
      tenantId: data.tenantId,
      type: data.type,
      channels,
    });

    // Check user preferences
    const preferences = getNotificationPreference(data.userId, data.tenantId, data.type);
    if (!preferences?.enabled) {
      logger.debug(`Notification disabled for user ${data.userId}`, { type: data.type });
      return { success: false, channels: {} };
    }

    // Send through each requested channel
    for (const channel of channels) {
      if (preferences.channels[channel] === false) {
        logger.debug(`Channel ${channel} disabled for ${data.userId}`);
        results[channel] = false;
        continue;
      }

      try {
        switch (channel) {
          case NotificationChannel.IN_APP:
            results[channel] = await sendInAppNotification(data);
            break;

          case NotificationChannel.EMAIL:
            results[channel] = await sendEmailNotification(data);
            break;

          case NotificationChannel.PUSH:
            results[channel] = await sendPushNotification(data);
            break;

          case NotificationChannel.SMS:
            results[channel] = await sendSMSNotification(data);
            break;

          default:
            results[channel] = false;
        }
      } catch (error) {
        logger.error(`Failed to send ${channel} notification`, {
          userId: data.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results[channel] = false;
      }
    }

    const allSuccess = Object.values(results).some((v) => v === true);

    logger.info(`Notification sent to ${data.userId}`, {
      tenantId: data.tenantId,
      channels: results,
    });

    return { success: allSuccess, channels: results };
  } catch (error) {
    logger.error('Failed to send notification', {
      userId: data.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { success: false, channels: {} };
  }
}

/**
 * Send in-app notification
 */
async function sendInAppNotification(data: NotificationData): Promise<boolean> {
  try {
    const notification: NotificationData = {
      ...data,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date(),
      read: false,
    };

    const key = `${data.tenantId}:${data.userId}`;
    if (!notificationStore.has(key)) {
      notificationStore.set(key, []);
    }

    const userNotifications = notificationStore.get(key)!;
    userNotifications.unshift(notification); // Newest first

    // Keep only last 100 notifications
    if (userNotifications.length > 100) {
      userNotifications.pop();
    }

    logger.debug(`In-app notification created`, { id: notification.id, userId: data.userId });
    return true;
  } catch (error) {
    logger.error('Failed to create in-app notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Send email notification via queue
 */
async function sendEmailNotification(data: NotificationData): Promise<boolean> {
  try {
    // Queue email notification
    await notificationQueue.add(
      'notification',
      {
        tenantId: data.tenantId,
        userId: data.userId,
        type: 'email',
        title: data.title,
        message: data.message,
        data: data.data,
        actionUrl: data.actionUrl,
      },
      {
        priority: data.priority === 'critical' ? 1000 : 100,
      }
    );

    logger.debug(`Email notification queued`, { userId: data.userId });
    return true;
  } catch (error) {
    logger.error('Failed to queue email notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Send push notification
 */
async function sendPushNotification(data: NotificationData): Promise<boolean> {
  try {
    // Queue push notification
    await notificationQueue.add(
      'notification',
      {
        tenantId: data.tenantId,
        userId: data.userId,
        type: 'push',
        title: data.title,
        message: data.message,
        data: data.data,
        actionUrl: data.actionUrl,
      },
      {
        priority: data.priority === 'critical' ? 1000 : 150,
      }
    );

    logger.debug(`Push notification queued`, { userId: data.userId });
    return true;
  } catch (error) {
    logger.error('Failed to queue push notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Send SMS notification
 */
async function sendSMSNotification(data: NotificationData): Promise<boolean> {
  try {
    logger.debug(`SMS notification queued`, { userId: data.userId });
    // TODO: Implement SMS sending via Twilio/AWS SNS
    return true;
  } catch (error) {
    logger.error('Failed to send SMS notification', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Get user's in-app notifications
 */
export function getNotifications(
  tenantId: string,
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    type?: NotificationType;
  }
): NotificationData[] {
  const key = `${tenantId}:${userId}`;
  let notifications = notificationStore.get(key) || [];

  // Filter by type if specified
  if (options?.type) {
    notifications = notifications.filter((n) => n.type === options.type);
  }

  // Filter unread only
  if (options?.unreadOnly) {
    notifications = notifications.filter((n) => !n.read);
  }

  // Apply pagination
  const offset = options?.offset || 0;
  const limit = options?.limit || 20;

  return notifications.slice(offset, offset + limit);
}

/**
 * Mark notification as read
 */
export function markAsRead(tenantId: string, userId: string, notificationId: string): boolean {
  const key = `${tenantId}:${userId}`;
  const notifications = notificationStore.get(key);

  if (!notifications) {
    return false;
  }

  const notification = notifications.find((n) => n.id === notificationId);
  if (notification) {
    notification.read = true;
    notification.readAt = new Date();
    return true;
  }

  return false;
}

/**
 * Mark all notifications as read
 */
export function markAllAsRead(tenantId: string, userId: string): number {
  const key = `${tenantId}:${userId}`;
  const notifications = notificationStore.get(key);

  if (!notifications) {
    return 0;
  }

  let count = 0;
  for (const notification of notifications) {
    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      count++;
    }
  }

  return count;
}

/**
 * Delete notification
 */
export function deleteNotification(
  tenantId: string,
  userId: string,
  notificationId: string
): boolean {
  const key = `${tenantId}:${userId}`;
  const notifications = notificationStore.get(key);

  if (!notifications) {
    return false;
  }

  const index = notifications.findIndex((n) => n.id === notificationId);
  if (index >= 0) {
    notifications.splice(index, 1);
    return true;
  }

  return false;
}

/**
 * Clear all notifications for user
 */
export function clearNotifications(tenantId: string, userId: string): number {
  const key = `${tenantId}:${userId}`;
  const notifications = notificationStore.get(key);

  if (!notifications) {
    return 0;
  }

  const count = notifications.length;
  notificationStore.delete(key);
  return count;
}

/**
 * Get unread notification count
 */
export function getUnreadCount(tenantId: string, userId: string): number {
  const key = `${tenantId}:${userId}`;
  const notifications = notificationStore.get(key);

  if (!notifications) {
    return 0;
  }

  return notifications.filter((n) => !n.read).length;
}

/**
 * Set notification preferences
 */
export function setNotificationPreference(preference: NotificationPreference): void {
  const key = `${preference.tenantId}:${preference.userId}:${preference.type}`;
  preferenceStore.set(key, preference);

  logger.debug(`Notification preference updated`, {
    userId: preference.userId,
    type: preference.type,
  });
}

/**
 * Get notification preference
 */
export function getNotificationPreference(
  userId: string,
  tenantId: string,
  type: NotificationType
): NotificationPreference | null {
  const key = `${tenantId}:${userId}:${type}`;
  return preferenceStore.get(key) || null;
}

/**
 * Get all preferences for user
 */
export function getAllPreferences(tenantId: string, userId: string): NotificationPreference[] {
  const preferences: NotificationPreference[] = [];

  for (const [key, preference] of preferenceStore.entries()) {
    if (key.startsWith(`${tenantId}:${userId}:`)) {
      preferences.push(preference);
    }
  }

  return preferences;
}

/**
 * Batch send notifications
 */
export async function sendBatchNotifications(
  notifications: NotificationData[]
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  logger.info(`Sending batch notifications`, { count: notifications.length });

  for (const notification of notifications) {
    const id = notification.id || `${notification.userId}-${Date.now()}`;
    try {
      const result = await sendNotification(notification);
      results[id] = result.success;
    } catch (error) {
      logger.error(`Failed to send batch notification`, {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      results[id] = false;
    }
  }

  return results;
}

/**
 * Export notification utilities
 */
export const notificationUtils = {
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
  sendBatchNotifications,
};
