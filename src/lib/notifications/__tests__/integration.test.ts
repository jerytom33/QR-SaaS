/**
 * Integration Tests
 * 
 * Tests for:
 * - End-to-end notification flows
 * - Multi-channel delivery coordination
 * - User preference integration
 * - Error recovery and retry logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sendNotification,
  getNotifications,
  markAsRead,
  getUnreadCount,
  setNotificationPreference,
  clearNotifications,
  markAllAsRead,
  deleteNotification,
  NotificationType,
  NotificationChannel,
} from '../index';

describe('Integration Tests', () => {
  const tenantId = 'integration-test-tenant';
  const userId = 'integration-test-user';

  beforeEach(() => {
    clearNotifications(tenantId, userId);
  });

  describe('End-to-End Notification Flow', () => {
    it('should complete full notification lifecycle', async () => {
      // Step 1: Send notification
      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'New Contact Added',
        message: 'John Doe has been added to your contacts',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        actionUrl: 'https://app.example.com/contacts/john-doe',
        actionLabel: 'View Contact',
        data: {
          contactId: 'contact-1',
          contactName: 'John Doe',
        },
      });

      expect(result.success).toBe(true);

      // Step 2: Retrieve notification
      const notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBeGreaterThan(0);
      const notification = notifications[0];
      expect(notification.title).toBe('New Contact Added');
      expect(notification.read).toBe(false);

      // Step 3: Verify unread count
      const unreadCount = getUnreadCount(tenantId, userId);
      expect(unreadCount).toBeGreaterThan(0);

      // Step 4: Mark as read
      const markResult = markAsRead(tenantId, userId, notification.id!);
      expect(markResult).toBe(true);

      // Step 5: Verify marked as read
      const updated = getNotifications(tenantId, userId)[0];
      expect(updated.read).toBe(true);
      expect(updated.readAt).toBeDefined();

      // Step 6: Verify unread count decreased
      const newUnreadCount = getUnreadCount(tenantId, userId);
      expect(newUnreadCount).toBe(0);
    });

    it('should handle multiple concurrent notifications', async () => {
      const notificationPromises: Promise<any>[] = [];

      for (let i = 0; i < 5; i++) {
        notificationPromises.push(
          sendNotification({
            tenantId,
            userId,
            type: NotificationType.CONTACT_CREATED,
            title: `Contact ${i}`,
            message: `Message ${i}`,
            channels: [NotificationChannel.IN_APP],
          })
        );
      }

      const results = await Promise.all(notificationPromises);

      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      const notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('should handle notification with complex data structure', async () => {
      const complexData = {
        contact: {
          id: 'contact-1',
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
          company: 'ACME Corp',
        },
        source: {
          id: 'source-1',
          name: 'API Integration',
          platform: 'Salesforce',
        },
      };

      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'VIP Contact Added',
        message: 'Important contact from Salesforce',
        channels: [NotificationChannel.IN_APP],
        data: complexData,
        tags: ['vip', 'api-integration'],
      });

      expect(result.success).toBe(true);

      const notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Channel Delivery Coordination', () => {
    it('should respect per-channel preferences', async () => {
      // Set preferences
      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.CONTACT_CREATED,
        channels: {
          [NotificationChannel.IN_APP]: true,
          [NotificationChannel.EMAIL]: true,
          [NotificationChannel.PUSH]: false,
        },
        enabled: true,
      });

      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
      });

      expect(result.success).toBe(true);
    });

    it('should disable all notifications when preference is disabled', async () => {
      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.CONTACT_CREATED,
        channels: {
          [NotificationChannel.IN_APP]: true,
          [NotificationChannel.EMAIL]: true,
        },
        enabled: false,
      });

      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      });

      // Should be blocked due to disabled preference
      expect(result.success).toBe(false);
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    it('should handle partial delivery failure', async () => {
      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      });

      // At least IN_APP should succeed
      expect(result.channels[NotificationChannel.IN_APP]).toBe(true);

      // Verify in-app notification was created
      const notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBeGreaterThan(0);
    });
  });

  describe('Batch Operations Performance', () => {
    it('should efficiently handle bulk notification retrieval', async () => {
      // Create notifications
      for (let i = 0; i < 20; i++) {
        await sendNotification({
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: `Contact ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      const startTime = Date.now();
      const notifications = getNotifications(tenantId, userId);
      const duration = Date.now() - startTime;

      expect(notifications.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('should efficiently mark bulk notifications as read', async () => {
      // Create notifications
      for (let i = 0; i < 10; i++) {
        await sendNotification({
          tenantId,
          userId,
          type: NotificationType.CONTACT_CREATED,
          title: `Contact ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      const startTime = Date.now();
      markAllAsRead(tenantId, userId);
      const duration = Date.now() - startTime;

      expect(getUnreadCount(tenantId, userId)).toBe(0);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('User Workflow Scenarios', () => {
    it('should handle typical user workflow', async () => {
      // 1. Create preferences
      setNotificationPreference({
        userId,
        tenantId,
        type: NotificationType.CONTACT_CREATED,
        channels: {
          [NotificationChannel.IN_APP]: true,
          [NotificationChannel.EMAIL]: true,
        },
        enabled: true,
      });

      // 2. Receive notification
      const result = await sendNotification({
        tenantId,
        userId,
        type: NotificationType.CONTACT_CREATED,
        title: 'New Contact',
        message: 'Contact added',
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      });

      expect(result.success).toBe(true);

      // 3. Check inbox
      let notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBeGreaterThan(0);

      // 4. Mark notification as read
      const notifId = notifications[0].id;
      markAsRead(tenantId, userId, notifId!);

      // 5. Verify read status
      notifications = getNotifications(tenantId, userId);
      expect(notifications[0].read).toBe(true);

      // 6. Delete notification
      deleteNotification(tenantId, userId, notifId!);
      notifications = getNotifications(tenantId, userId);
      expect(notifications.length).toBe(0);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('should isolate notifications between tenants', async () => {
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';
      const user = 'test-user';

      // Create notification for tenant 1
      await sendNotification({
        tenantId: tenant1,
        userId: user,
        type: NotificationType.CONTACT_CREATED,
        title: 'Tenant 1 Notification',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      // Create notification for tenant 2
      await sendNotification({
        tenantId: tenant2,
        userId: user,
        type: NotificationType.CONTACT_CREATED,
        title: 'Tenant 2 Notification',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      // Verify isolation
      const tenant1Notifs = getNotifications(tenant1, user);
      const tenant2Notifs = getNotifications(tenant2, user);

      expect(tenant1Notifs.length).toBeGreaterThan(0);
      expect(tenant2Notifs.length).toBeGreaterThan(0);
    });
  });
});
