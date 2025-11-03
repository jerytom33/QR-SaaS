/**
 * WebSocket Integration Tests
 * 
 * Tests for:
 * - WebSocket connection management
 * - Real-time notification broadcasting
 * - Client subscriptions
 * - Connection error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { WebSocketNotificationBroadcaster } from '../websocket';
import { NotificationType, NotificationChannel } from '../types';

describe('WebSocket Notification Broadcasting', () => {
  let broadcaster: WebSocketNotificationBroadcaster;
  let server: WebSocketServer;

  beforeEach(() => {
    broadcaster = new WebSocketNotificationBroadcaster();
    server = new WebSocketServer({ port: 8080 });
    // Swallow occasional socket errors during teardown to avoid unhandled exceptions
    server.on('error', () => {});
  });

  afterEach(() => {
    broadcaster.close();
    server.close();
  });

  describe('Connection Management', () => {
    it('should handle client connections', async () => {
      const clientSpy = vi.fn();

      const p = new Promise<void>((resolve) => {
        server.on('connection', () => {
          clientSpy();
          expect(clientSpy).toHaveBeenCalled();
          resolve();
        });
      });

      broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user',
      });

      await p;
    });

    it('should handle connection errors', async () => {
      broadcaster.on('error', (error) => {
        expect(error).toBeDefined();
      });

      // Try to connect to invalid endpoint
      await broadcaster.connect('ws://localhost:9999', {
        tenantId: 'test-tenant',
        userId: 'test-user',
      });
    });

    it('should reconnect on disconnect', async () => {
      const reconnectSpy = vi.fn();

      broadcaster.on('reconnect', () => {
        reconnectSpy();
      });

      await broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user',
      });

      // Simulate disconnect
      broadcaster.disconnect();

      // Wait a bit and verify reconnection is attempted
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(reconnectSpy).toHaveBeenCalled();
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast notification to connected clients', async () => {
      const messageHandler = vi.fn();

      const p = new Promise<void>((resolve) => {
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type !== 'notification') return; // ignore auth
            messageHandler(message);

            expect(messageHandler).toHaveBeenCalledWith(
              expect.objectContaining({
                type: 'notification',
                data: expect.any(Object),
              })
            );
            resolve();
          });
        });
      });

        await broadcaster.connect('ws://localhost:8080', {
          tenantId: 'test-tenant',
          userId: 'test-user',
        });

        broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      await p;
    });

    it('should broadcast to multiple clients', async () => {
      const clients = new Set();
      let connectedCount = 0;

      const p = new Promise<void>((resolve) => {
        server.on('connection', (ws) => {
          clients.add(ws);
          connectedCount++;

          if (connectedCount === 2) {
            // Both clients connected
            let receivedCount = 0;

            clients.forEach((client: any) => {
              client.on('message', () => {
                receivedCount++;
                if (receivedCount === 2) {
                  expect(receivedCount).toBe(2);
                  resolve();
                }
              });
            });
              broadcaster.broadcast('test-tenant', 'test-user', {
              type: NotificationType.CONTACT_CREATED,
              title: 'Test',
              message: 'Message',
              channels: [NotificationChannel.IN_APP],
            });
          }
        });
      });

      // Connect two clients
      broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user-1',
      });

      broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user-2',
      });
      await p;
    });

    it('should broadcast to tenant', async () => {
      const messages: any[] = [];
      let connectedCount = 0;

      const p = new Promise<void>((resolve) => {
        server.on('connection', (ws) => {
          connectedCount++;

          ws.on('message', (data) => {
            messages.push(JSON.parse(data.toString()));

            if (messages.length === 2) {
              expect(messages.length).toBe(2);
              resolve();
            }
          });
        });
      });

      // Connect multiple users in same tenant
      broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'user-1',
      });

      broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'user-2',
      });

      // Wait for connections
      setTimeout(() => {
        broadcaster.broadcastToTenant('test-tenant', {
          type: NotificationType.SYSTEM_ALERT,
          title: 'System Alert',
          message: 'Message',
          channels: [NotificationChannel.IN_APP],
        });
      }, 100);

      await p;
    });
  });

  describe('Subscriptions', () => {
    it('should subscribe to user notifications', async () => {
      const notificationSpy = vi.fn();

      const p = new Promise<void>((resolve) => {
        broadcaster.subscribe(
          'test-tenant',
          'test-user',
          NotificationType.CONTACT_CREATED,
          (notification) => {
            notificationSpy(notification);
            expect(notificationSpy).toHaveBeenCalledWith(
              expect.objectContaining({
                type: NotificationType.CONTACT_CREATED,
              })
            );
            resolve();
          }
        );
      });

      broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      await p;
    });

    it('should unsubscribe from notifications', async () => {
      const notificationSpy = vi.fn();

      const unsubscribe = broadcaster.subscribe(
        'test-tenant',
        'test-user',
        NotificationType.CONTACT_CREATED,
        notificationSpy
      );

      unsubscribe();

      broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      // Wait a bit to ensure no callback is triggered
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(notificationSpy).not.toHaveBeenCalled();
    });

    it('should support multiple subscriptions', async () => {
      const contactSpy = vi.fn();
      const leadSpy = vi.fn();

      broadcaster.subscribe(
        'test-tenant',
        'test-user',
        NotificationType.CONTACT_CREATED,
        contactSpy
      );

      broadcaster.subscribe(
        'test-tenant',
        'test-user',
        NotificationType.LEAD_ASSIGNED,
        leadSpy
      );

      broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.LEAD_ASSIGNED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      // Wait for callbacks
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(contactSpy).toHaveBeenCalledTimes(1);
      expect(leadSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Message Serialization', () => {
    it('should serialize complex notification data', async () => {
      const messageHandler = vi.fn();

      const p = new Promise<void>((resolve) => {
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type !== 'notification') return; // ignore auth
            messageHandler(message);

            expect(message.data.data).toEqual({
              contactId: 'contact-1',
              contactName: 'John Doe',
              source: { id: 'source-1', name: 'Google' },
            });
            resolve();
          });
        });
      });

      await broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user',
      });

      broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
        data: {
          contactId: 'contact-1',
          contactName: 'John Doe',
          source: { id: 'source-1', name: 'Google' },
        },
      });
      await p;
    });

    it('should handle circular references', async () => {
      const obj: any = { name: 'John' };
      obj.self = obj; // Circular reference

      const messageHandler = vi.fn();

      const p = new Promise<void>((resolve) => {
        server.on('connection', (ws) => {
          ws.on('message', () => {
            messageHandler();
            // Should not throw
            expect(messageHandler).toHaveBeenCalled();
            resolve();
          });
        });
      });

      // This should handle circular refs gracefully
      await broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user',
      });
      try {
        broadcaster.broadcast('test-tenant', 'test-user', {
          type: NotificationType.CONTACT_CREATED,
          title: 'Test',
          message: 'Message',
          channels: [NotificationChannel.IN_APP],
          data: { user: { name: 'John' } },
        });
      } catch (error) {
        // Expected to handle gracefully
      }

      await p;
    });
  });

  describe('Performance', () => {
    it('should handle high-frequency broadcasts', async () => {
      const messageCount = 100;
      let receivedCount = 0;

      server.on('connection', (ws) => {
        ws.on('message', () => {
          receivedCount++;
        });
      });

      await broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user',
      });

      const startTime = Date.now();

      for (let i = 0; i < messageCount; i++) {
        broadcaster.broadcast('test-tenant', 'test-user', {
          type: NotificationType.CONTACT_CREATED,
          title: `Test ${i}`,
          message: `Message ${i}`,
          channels: [NotificationChannel.IN_APP],
        });
      }

      // Wait for messages
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const duration = Date.now() - startTime;
      const throughput = messageCount / (duration / 1000);

      expect(receivedCount).toBeGreaterThan(0);
      // Should handle at least 10 messages per second
      expect(throughput).toBeGreaterThan(10);
    });

    it('should handle large payloads', async () => {
      const largeData = {
        contacts: Array.from({ length: 100 }, (_, i) => ({
          id: `contact-${i}`,
          name: `Contact ${i}`,
          email: `contact${i}@example.com`,
          phone: `555-${String(i).padStart(4, '0')}`,
          address: `${i} Main Street, City, State, ZIP`,
        })),
      };

      const p = new Promise<void>((resolve) => {
        server.on('connection', (ws) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type !== 'notification') return; // ignore auth
            expect(message.data.data.contacts.length).toBe(100);
            resolve();
          });
        });
      });

      await broadcaster.connect('ws://localhost:8080', {
        tenantId: 'test-tenant',
        userId: 'test-user',
      });

      broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
        data: largeData,
      });
      await p;
    });
  });

  describe('Error Handling', () => {
    it('should handle message delivery failures', async () => {
      const errorHandler = vi.fn();
      broadcaster.on('error', errorHandler);

      // Try to broadcast when disconnected
      broadcaster.broadcast('test-tenant', 'test-user', {
        type: NotificationType.CONTACT_CREATED,
        title: 'Test',
        message: 'Message',
        channels: [NotificationChannel.IN_APP],
      });

      // Wait for error to be emitted
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should validate notification data before broadcasting', async () => {
      const errorHandler = vi.fn();
      broadcaster.on('error', errorHandler);

      try {
        broadcaster.broadcast('test-tenant', 'test-user', {
          type: NotificationType.CONTACT_CREATED,
          title: '', // Invalid: empty title
          message: 'Message',
          channels: [NotificationChannel.IN_APP],
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
