/**
 * WebSocket Server for Real-Time Notifications
 * 
 * Provides real-time notification delivery via WebSocket connection
 * Supports multiple concurrent connections per user
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '@/lib/logging';
import { NotificationData } from './index';

/**
 * WebSocket connection manager
 */
export class NotificationServer {
  private io: SocketIOServer | null = null;
  private userConnections = new Map<string, Set<string>>();

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    } as any);

    this.setupEventHandlers();

    logger.info('WebSocket server initialized');
    return this.io;
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      logger.debug('User connected', { socketId: socket.id });

      // Subscribe to notifications
      socket.on('subscribe:notifications', (data: { userId: string; tenantId: string }) => {
        this.handleSubscribe(socket, data);
      });

      // Unsubscribe from notifications
      socket.on('unsubscribe:notifications', (data: { userId: string }) => {
        this.handleUnsubscribe(socket, data);
      });

      // Mark notification as read
      socket.on('notification:read', (data: { notificationId: string }) => {
        this.handleNotificationRead(socket, data);
      });

      // Mark all as read
      socket.on('notification:read-all', () => {
        this.handleMarkAllAsRead(socket);
      });

      // Delete notification
      socket.on('notification:delete', (data: { notificationId: string }) => {
        this.handleDeleteNotification(socket, data);
      });

      // Heartbeat/ping
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Connection error
      socket.on('error', (error) => {
        logger.error('WebSocket error', { socketId: socket.id, error });
      });

      // Disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  /**
   * Handle subscription
   */
  private handleSubscribe(socket: Socket, data: { userId: string; tenantId: string }): void {
    const { userId, tenantId } = data;
    const room = `user:${tenantId}:${userId}`;

    socket.join(room);

    const key = `${tenantId}:${userId}`;
    if (!this.userConnections.has(key)) {
      this.userConnections.set(key, new Set());
    }
    this.userConnections.get(key)!.add(socket.id);

    logger.debug(`User subscribed to notifications`, {
      socketId: socket.id,
      room,
      connections: this.userConnections.get(key)!.size,
    });

    socket.emit('notification:subscribed', { status: 'subscribed', room });
  }

  /**
   * Handle unsubscription
   */
  private handleUnsubscribe(socket: Socket, data: { userId: string }): void {
    const { userId } = data;
    socket.disconnect(true);

    logger.debug(`User unsubscribed from notifications`, {
      socketId: socket.id,
      userId,
    });
  }

  /**
   * Handle notification read
   */
  private handleNotificationRead(
    socket: Socket,
    data: { notificationId: string }
  ): void {
    logger.debug(`Notification marked as read`, {
      socketId: socket.id,
      notificationId: data.notificationId,
    });
    socket.emit('notification:read-ack', { notificationId: data.notificationId });
  }

  /**
   * Handle mark all as read
   */
  private handleMarkAllAsRead(socket: Socket): void {
    logger.debug(`All notifications marked as read`, { socketId: socket.id });
    socket.emit('notification:read-all-ack', { status: 'success' });
  }

  /**
   * Handle delete notification
   */
  private handleDeleteNotification(
    socket: Socket,
    data: { notificationId: string }
  ): void {
    logger.debug(`Notification deleted`, {
      socketId: socket.id,
      notificationId: data.notificationId,
    });
    socket.emit('notification:delete-ack', { notificationId: data.notificationId });
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(socket: Socket): void {
    logger.debug('User disconnected', { socketId: socket.id });

    // Clean up connections
    for (const [key, connections] of this.userConnections.entries()) {
      connections.delete(socket.id);
      if (connections.size === 0) {
        this.userConnections.delete(key);
      }
    }
  }

  /**
   * Send notification to user via WebSocket
   */
  broadcastNotification(
    tenantId: string,
    userId: string,
    notification: NotificationData
  ): number {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return 0;
    }

    const room = `user:${tenantId}:${userId}`;
    const connections = this.userConnections.get(`${tenantId}:${userId}`)?.size || 0;

    this.io.to(room).emit('notification:new', {
      notification,
      timestamp: new Date().toISOString(),
    });

    if (connections > 0) {
      logger.debug(`Notification broadcasted`, {
        room,
        connections,
        notificationType: notification.type,
      });
    }

    return connections;
  }

  /**
   * Broadcast to multiple users
   */
  broadcastToUsers(
    tenantId: string,
    userIds: string[],
    notification: NotificationData
  ): Record<string, number> {
    const results: Record<string, number> = {};

    for (const userId of userIds) {
      results[userId] = this.broadcastNotification(tenantId, userId, notification);
    }

    return results;
  }

  /**
   * Get connection count for user
   */
  getConnectionCount(tenantId: string, userId: string): number {
    const key = `${tenantId}:${userId}`;
    return this.userConnections.get(key)?.size || 0;
  }

  /**
   * Get total active connections
   */
  getTotalConnections(): number {
    return Array.from(this.userConnections.values()).reduce((sum, set) => sum + set.size, 0);
  }

  /**
   * Get server stats
   */
  getStats() {
    return {
      connectedUsers: this.userConnections.size,
      totalConnections: this.getTotalConnections(),
      socketConnections: this.io?.engine.clientsCount || 0,
    };
  }

  /**
   * Close server
   */
  close(): void {
    if (this.io) {
      this.io.close();
      logger.info('WebSocket server closed');
    }
  }
}

/**
 * Singleton instance
 */
let notificationServer: NotificationServer | null = null;

/**
 * Get or create notification server
 */
export function getNotificationServer(): NotificationServer {
  if (!notificationServer) {
    notificationServer = new NotificationServer();
  }
  return notificationServer;
}

/**
 * Initialize notification server
 */
export function initializeNotificationServer(httpServer: HTTPServer): SocketIOServer {
  const server = getNotificationServer();
  return server.initialize(httpServer);
}
