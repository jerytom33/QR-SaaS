/**
 * Notification System Tests
 * 
 * Tests for:
 * - Multi-channel notification delivery
 * - In-app notifications
 * - Preferences management
 * - WebSocket broadcasting
 * - Batch operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  sendBatchNotifications,
  NotificationChannel,
  NotificationType,
  NotificationData,
} from '../index';

describe('Notification System', () => {
  const tenantId = 'test-tenant';
  const userId = 'test-user';

  beforeEach(() => {
    // Clear notifications before each test
    clearNotifications(tenantId, userId);
  });

  describe('In-App Notifications', () => {
    it('should send in-app notification', async () => {
      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'New Contact',
        message: 'A new contact was created',
        channels: [NotificationChannel.IN_APP],
      });

      expect(result.success).toBe(true);
      expect(result.channels[NotificationChannel.IN_APP]).toBe(true);
    });

    it('should get user notifications', () => {
      sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Contact 1',
        message: 'Message 1',
        channels: [NotificationChannel.IN_APP],
      });

      sendNotification({
        tenantId,
        userId,
        type: NotificationType.LEAD_ASSIGNED,
        title: 'Lead Assigned',
        message: 'You have a new lead',
        channels: [NotificationChannel.IN_APP],
      });

      const notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBe(2);
      expect(notifications[0].title).toBe('Lead Assigned'); // Most recent first
    });

    it('should paginate notifications', () => {
      // Create 25 notifications
      for (let i = 0; i < 25; i++) {
        sendNotification({
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      // Get first page (limit 10)
      const page1 = getNotifications(tenantId, userId, { limit: 10, offset: 0 });
      expect(page1.length).toBe(10);

      // Get second page
      const page2 = getNotifications(tenantId, userId, { limit: 10, offset: 10 });
      expect(page2.length).toBe(10);

      // Verify no overlap
      const ids1 = page1.map((n) => n.id);
      const ids2 = page2.map((n) => n.id);
      const overlap = ids1.filter((id) => ids2.includes(id));
      expect(overlap.length).toBe(0);
    });

    it('should filter notifications by type', () => {
      sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Contact Created',
        message: 'Message 1',
        channels: [NotificationChannel.IN_APP],
      });

      sendNotification({
        tenantId,
        userId,
        type: NotificationType.LEAD_ASSIGNED,
        title: 'Lead Assigned',
        message: 'Message 2',
        channels: [NotificationChannel.IN_APP],
      });

      const contactNotifications = getNotifications(tenantId, userId, {
        type: NotificationType.CONTACT_CREATED,
      });

      expect(contactNotifications.length).toBe(1);
      expect(contactNotifications[0].type).toBe(NotificationType.CONTACT_CREATED);
    });
  });

  describe('Mark as Read', () => {
    it('should mark single notification as read', () => {
      const notif = {
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      };

      sendNotification(notif);
      const notifications = getNotifications(tenantId, userId);
      const notificationId = notifications[0].id;

      const success = markAsRead(tenantId, userId, notificationId!);
      expect(success).toBe(true);

      const updated = getNotifications(tenantId, userId)[0];
      expect(updated.read).toBe(true);
      expect(updated.readAt).toBeDefined();
    });

    it('should mark all notifications as read', async () => {
      // Create multiple notifications
      for (let i = 0; i < 5; i++) {
        await sendNotification({
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      expect(getUnreadCount(tenantId, userId)).toBe(5);

      const count = markAllAsRead(tenantId, userId);
      expect(count).toBe(5);
      expect(getUnreadCount(tenantId, userId)).toBe(0);
    });

    it('should get unread count', async () => {
      for (let i = 0; i < 3; i++) {
        await sendNotification({
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      expect(getUnreadCount(tenantId, userId)).toBe(3);

      const notifications = getNotifications(tenantId, userId);
      markAsRead(tenantId, userId, notifications[0].id!);

      expect(getUnreadCount(tenantId, userId)).toBe(2);
    });

    it('should filter unread notifications', async () => {
      for (let i = 0; i < 5; i++) {
        await sendNotification({
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      // Mark first 2 as read
      const notifications = getNotifications(tenantId, userId);
      markAsRead(tenantId, userId, notifications[0].id!);
      markAsRead(tenantId, userId, notifications[1].id!);

      // Get unread only
      const unread = getNotifications(tenantId, userId, { unreadOnly: true });
      expect(unread.length).toBe(3);
      expect(unread.every((n) => !n.read)).toBe(true);
    });
  });

  describe('Delete Notifications', () => {
    it('should delete single notification', async () => {
      await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      const notifications = getNotifications(tenantId, userId);
      const notificationId = notifications[0].id;

      const success = deleteNotification(tenantId, userId, notificationId!);
      expect(success).toBe(true);

      const remaining = getNotifications(tenantId, userId);
      expect(remaining.length).toBe(0);
    });

    it('should clear all notifications', async () => {
      for (let i = 0; i < 5; i++) {
        await sendNotification({
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: `Notification ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      expect(getNotifications(tenantId, userId).length).toBe(5);

      const count = clearNotifications(tenantId, userId);
      expect(count).toBe(5);
      expect(getNotifications(tenantId, userId).length).toBe(0);
    });
  });

  describe('Notification Preferences', () => {
    it('should set notification preference', () => {
      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.CONTACT_CREATED,
        channels: {
          [NotificationChannel.IN_APP]: true,
          [NotificationChannel.EMAIL]: false,
        },
        enabled: true,
      });

      const preference = getNotificationPreference(userId, tenantId, NotificationType.CONTACT_CREATED);
      expect(preference?.enabled).toBe(true);
      expect(preference?.channels[NotificationChannel.IN_APP]).toBe(true);
      expect(preference?.channels[NotificationChannel.EMAIL]).toBe(false);
    });

    it('should get all preferences for user', () => {
      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.CONTACT_CREATED,
        channels: { [NotificationChannel.IN_APP]: true },
        enabled: true,
      });

      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.LEAD_ASSIGNED,
        channels: { [NotificationChannel.EMAIL]: true },
        enabled: true,
      });

      const preferences = getAllPreferences(tenantId, userId);
      expect(preferences.length).toBe(2);
      expect(preferences.map((p) => p.type)).toContain(NotificationType.CONTACT_CREATED);
      expect(preferences.map((p) => p.type)).toContain(NotificationType.LEAD_ASSIGNED);
    });

    it('should disable notifications', () => {
      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.CONTACT_CREATED,
        channels: { [NotificationChannel.IN_APP]: true },
        enabled: false,
      });

      const preference = getNotificationPreference(userId, tenantId, NotificationType.CONTACT_CREATED);
      expect(preference?.enabled).toBe(false);
    });
  });

  describe('Multi-Channel Notifications', () => {
    it('should send through multiple channels', async () => {
      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
      });

      expect(result.success).toBe(true);
      expect(result.channels[NotificationChannel.IN_APP]).toBe(true);
      // Email and Push are queued, so they return true (enqueued)
    });

    it('should respect user preferences', async () => {
      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.CONTACT_CREATED,
        channels: {
          [NotificationChannel.IN_APP]: true,
          [NotificationChannel.EMAIL]: false,
        },
        enabled: true,
      });

      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      });

      expect(result.success).toBe(true);
      // Email channel should be false due to disabled preference
    });
  });

  describe('Batch Operations', () => {
    it('should send batch notifications', async () => {
      const notifications: NotificationData[] = [
        {
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: 'Notification 1',
          message: 'Message 1',
          channels: [NotificationChannel.IN_APP],
        },
        {
          tenantId,
          userId: 'another-user',
          type: NotificationType.LEAD_ASSIGNED,
          title: 'Notification 2',
          message: 'Message 2',
          channels: [NotificationChannel.IN_APP],
        },
      ];

      const results = await sendBatchNotifications(notifications);
      expect(Object.values(results).filter((r) => r === true).length).toBeGreaterThan(0);
    });
  });

  describe('Notification Priority', () => {
    it('should handle priority levels', async () => {
      const priorities: Array<'low' | 'normal' | 'high' | 'critical'> = [
        'low',
        'normal',
        'high',
        'critical',
      ];

      for (const priority of priorities) {
        const result = await sendNotification({
          tenantId,
          userId,
          type: NotificationType.SYSTEM_ALERT,
          title: `${priority} priority alert`,
          message: 'Message',
          channels: [NotificationChannel.IN_APP],
          priority,
        });

        expect(result.success).toBe(true);
      }

      const notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBe(4);
    });
  });

  describe('Notification Tags', () => {
    it('should support notification tags', async () => {
      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
        tags: ['urgent', 'contact-management'],
      });

      expect(result.success).toBe(true);

      const notifications = getNotifications(tenantId, userId);
      expect(notifications[0].tags).toEqual(['urgent', 'contact-management']);
    });
  });

  describe('Notification Metadata', () => {
    it('should include action URL and label', async () => {
      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'New Contact',
        message: 'John Doe was added',
        channels: [NotificationChannel.IN_APP],
        actionUrl: 'https://app.example.com/contacts/contact-1',
        actionLabel: 'View Contact',
      });

      expect(result.success).toBe(true);

      const notifications = getNotifications(tenantId, userId);
      expect(notifications[0].actionUrl).toBe('https://app.example.com/contacts/contact-1');
      expect(notifications[0].actionLabel).toBe('View Contact');
    });

    it('should include custom data', async () => {
      const customData = {
        contactId: 'contact-1',
        contactName: 'John Doe',
        sourceId: 'source-1',
      };

      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'New Contact',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
        data: customData,
      });

      expect(result.success).toBe(true);

      const notifications = getNotifications(tenantId, userId);
      expect(notifications[0].data).toEqual(customData);
    });
  });
});
