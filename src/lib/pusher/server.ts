/**
 * Pusher Server Configuration
 * Replaces Socket.IO for Vercel-compatible real-time features
 */

import Pusher from 'pusher';
import { config } from '@/lib/config';

// Singleton Pusher instance
let pusherInstance: Pusher | null = null;

export function getPusherServer(): Pusher {
  if (!pusherInstance) {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2';

    if (!appId || !key || !secret) {
      throw new Error(
        'Pusher credentials not configured. Set PUSHER_APP_ID, NEXT_PUBLIC_PUSHER_KEY, and PUSHER_SECRET environment variables.'
      );
    }

    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }

  return pusherInstance;
}

/**
 * Trigger a real-time event to a specific channel
 */
export async function triggerPusherEvent(
  channel: string,
  event: string,
  data: any
): Promise<void> {
  try {
    const pusher = getPusherServer();
    await pusher.trigger(channel, event, data);
  } catch (error) {
    console.error('Pusher trigger error:', error);
    // Don't throw - real-time is optional
  }
}

/**
 * Trigger multiple events at once
 */
export async function triggerPusherBatch(
  batch: Array<{ channel: string; name: string; data: any }>
): Promise<void> {
  try {
    const pusher = getPusherServer();
    await pusher.triggerBatch(batch);
  } catch (error) {
    console.error('Pusher batch trigger error:', error);
  }
}

/**
 * Authenticate private/presence channels
 */
export function authenticatePusherChannel(
  socketId: string,
  channel: string,
  userData?: any
): string {
  const pusher = getPusherServer();
  
  if (channel.startsWith('presence-')) {
    return pusher.authorizeChannel(socketId, channel, {
      user_id: userData?.userId || 'anonymous',
      user_info: {
        name: userData?.name || 'Anonymous',
        email: userData?.email,
      },
    });
  } else {
    return pusher.authorizeChannel(socketId, channel);
  }
}
