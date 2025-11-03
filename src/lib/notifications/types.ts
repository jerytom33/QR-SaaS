/**
 * Notification Types (Shared)
 *
 * This module centralizes notification type definitions so both the
 * high-level notification utilities (index.ts) and the WebSocket
 * broadcaster (websocket.ts) consume the SAME enum/interface types.
 *
 * NOTE: We re-export core types from `./index` to avoid divergent
 * definitions across files. This prevents subtle type mismatches
 * when different modules import from different paths.
 */

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  BOUNCED = 'BOUNCED',
}

// Re-export core types so tests and websocket code can import from './types'
import { NotificationChannel, NotificationType } from './index';
import type { NotificationData } from './index';
export { NotificationChannel, NotificationType };
export type { NotificationData };

// Rich notification object used for delivered/received notifications
export interface Notification extends NotificationData {
  id: string;
  read: boolean;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  status?: NotificationStatus;
}

// Backward/extended shape used by docs and potential future features
export interface NotificationExtended {
  id?: string;
  tenantId: string;
  userId: string;
  title: string;
  message: string;
  channels: import('./index').NotificationChannel[];
  actionUrl?: string;
  actionLabel?: string;
  data?: Record<string, any>;
  tags?: string[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  status?: NotificationStatus;
}

export interface GetNotificationsOptions {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  tags?: string[];
}
