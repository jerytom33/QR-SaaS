/**
 * Pusher Client Configuration
 * Client-side Pusher for real-time subscriptions
 */

import PusherClient from 'pusher-js';

let pusherClientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!pusherClientInstance) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'us2';

    if (!key) {
      throw new Error('NEXT_PUBLIC_PUSHER_KEY not configured');
    }

    pusherClientInstance = new PusherClient(key, {
      cluster,
      authEndpoint: '/api/pusher/auth',
    });
  }

  return pusherClientInstance;
}

/**
 * Subscribe to a channel and return the channel instance
 */
export function subscribeToPusherChannel(channelName: string) {
  const pusher = getPusherClient();
  return pusher.subscribe(channelName);
}

/**
 * Unsubscribe from a channel
 */
export function unsubscribeFromPusherChannel(channelName: string) {
  const pusher = getPusherClient();
  pusher.unsubscribe(channelName);
}

/**
 * Clean up Pusher connection
 */
export function disconnectPusher() {
  if (pusherClientInstance) {
    pusherClientInstance.disconnect();
    pusherClientInstance = null;
  }
}
