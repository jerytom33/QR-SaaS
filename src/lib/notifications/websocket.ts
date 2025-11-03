/**
 * WebSocket Notification Broadcaster
 * 
 * Handles real-time notification broadcasting to connected clients
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Notification, NotificationType, NotificationData } from './types';

interface ClientConnection {
  ws: WebSocket;
  tenantId: string;
  userId: string;
  subscriptions: Set<NotificationType>;
}

interface SubscriptionCallback {
  (notification: Notification): void;
}

export class WebSocketNotificationBroadcaster extends EventEmitter {
  private clients: Map<string, ClientConnection> = new Map();
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private connectionInfo: Map<string, { url: string; auth: { tenantId: string; userId: string } }> = new Map();
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor() {
    super();
  }

  /**
   * Connect a client to the broadcaster
   */
  async connect(
    url: string,
    auth: { tenantId: string; userId: string }
  ): Promise<void> {
    const clientId = `${auth.tenantId}:${auth.userId}`;
    this.connectionInfo.set(clientId, { url, auth });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      try {
        const ws = new WebSocket(url);

        ws.on('open', () => {
          this.clients.set(clientId, {
            ws,
            tenantId: auth.tenantId,
            userId: auth.userId,
            subscriptions: new Set(),
          });

          // Send auth message
          this.sendMessage(ws, {
            type: 'auth',
            data: auth,
          });

          // Reset reconnect attempts
          this.reconnectAttempts.delete(clientId);

          this.emit('connected', { clientId, ...auth });
          if (!settled) {
            settled = true;
            resolve();
          }
        });

        ws.on('message', (data) => {
          this.handleMessage(clientId, data.toString());
        });

        ws.on('error', (error) => {
          this.emit('error', error);
          this.handleDisconnect(clientId);
          // don't reject here to allow reconnect flow
          if (!settled) {
            settled = true;
            resolve();
          }
        });

        ws.on('close', () => {
          this.handleDisconnect(clientId);
        });
      } catch (error) {
        this.emit('error', error);
        this.attemptReconnect(url, auth);
        if (!settled) {
          settled = true;
          resolve();
        }
      }
    });
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect(url: string, auth: { tenantId: string; userId: string }): void {
    const clientId = `${auth.tenantId}:${auth.userId}`;
    const attempts = this.reconnectAttempts.get(clientId) || 0;

    if (attempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, attempts);

      setTimeout(() => {
        this.reconnectAttempts.set(clientId, attempts + 1);
        this.connect(url, auth).catch(() => {
          // Retry will be attempted again
        });
      }, delay);

      this.emit('reconnect', { clientId, attempt: attempts + 1 });
    } else {
      this.emit('max-reconnect-attempts', { clientId });
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(clientId: string): void {
    this.clients.delete(clientId);
    this.emit('disconnected', { clientId });
    const info = this.connectionInfo.get(clientId);
    if (info) {
      this.attemptReconnect(info.url, info.auth);
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(clientId: string, data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, message.data);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, message.data);
          break;
        case 'ack':
          this.emit('ack', { clientId, messageId: message.messageId });
          break;
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(clientId: string, data: { types: NotificationType[] }): void {
    const client = this.clients.get(clientId);
    if (client) {
      data.types.forEach((type) => {
        client.subscriptions.add(type);
      });
    }
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscribe(clientId: string, data: { types: NotificationType[] }): void {
    const client = this.clients.get(clientId);
    if (client) {
      data.types.forEach((type) => {
        client.subscriptions.delete(type);
      });
    }
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(ws: WebSocket, message: any): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Broadcast notification to specific user
   */
  broadcast(
    tenantId: string,
    userId: string,
    notification: Omit<NotificationData, 'tenantId' | 'userId'>
  ): void {
    const clientId = `${tenantId}:${userId}`;
    const client = this.clients.get(clientId);

    if (client && client.ws.readyState === WebSocket.OPEN) {
      this.sendMessage(client.ws, {
        type: 'notification',
        data: {
          ...notification,
          sentAt: new Date().toISOString(),
        },
      });
    }

    // Always trigger local subscriptions
    this.triggerSubscriptions(tenantId, userId, notification);
  }

  /**
   * Broadcast to all users in tenant
   */
  broadcastToTenant(
    tenantId: string,
    notification: Omit<NotificationData, 'tenantId' | 'userId'>
  ): void {
    this.clients.forEach((client, clientId) => {
      if (client.tenantId === tenantId) {
        this.broadcast(tenantId, client.userId, notification);
      }
    });
  }

  /**
   * Subscribe to notifications
   */
  subscribe(
    tenantId: string,
    userId: string,
    type: NotificationType,
    callback: SubscriptionCallback
  ): () => void {
    const key = `${tenantId}:${userId}:${type}`;

    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }

    this.subscriptions.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(key);
        }
      }
    };
  }

  /**
   * Trigger local subscriptions
   */
  private triggerSubscriptions(
    tenantId: string,
    userId: string,
    notification: Omit<NotificationData, 'tenantId' | 'userId'>
  ): void {
    const key = `${tenantId}:${userId}:${notification.type}`;
    const callbacks = this.subscriptions.get(key);

    if (callbacks) {
      const notif: Notification = {
        ...notification,
        tenantId,
        userId,
        id: Math.random().toString(36),
        read: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      callbacks.forEach((callback) => {
        try {
          callback(notif);
        } catch (error) {
          this.emit('error', error);
        }
      });
    }
  }

  /**
   * Disconnect a specific client
   */
  disconnect(clientId?: string): void {
    if (clientId) {
      const client = this.clients.get(clientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
      this.clients.delete(clientId);
      return;
    }
    // No clientId provided: disconnect all
    this.clients.forEach((client, id) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
      this.clients.delete(id);
      this.handleDisconnect(id);
    });
  }

  /**
   * Close all connections
   */
  close(): void {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
    });
    this.clients.clear();
    this.subscriptions.clear();
    this.reconnectAttempts.clear();
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connectedClients: number;
    activeSubscriptions: number;
    reconnectingClients: number;
  } {
    return {
      connectedClients: this.clients.size,
      activeSubscriptions: this.subscriptions.size,
      reconnectingClients: this.reconnectAttempts.size,
    };
  }
}
