/**
 * Pusher Channel Authentication
 * Authorizes private and presence channels
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticatePusherChannel } from '@/lib/pusher/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { socket_id, channel_name } = body;

    if (!socket_id || !channel_name) {
      return NextResponse.json(
        { error: 'socket_id and channel_name required' },
        { status: 400 }
      );
    }

    // TODO: Get user data from session/JWT
    // For now, allow all connections
    const userData = {
      userId: 'demo-user',
      name: 'Demo User',
      email: 'demo@example.com',
    };

    const authResponse = authenticatePusherChannel(
      socket_id,
      channel_name,
      userData
    );

    return NextResponse.json(JSON.parse(authResponse));
  } catch (error) {
    console.error('Pusher auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
