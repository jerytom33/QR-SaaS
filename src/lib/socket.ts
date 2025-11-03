// Socket.IO is not supported on Vercel's serverless environment
// This file is kept for local development only
// For production on Vercel, consider using:
// - Pusher (https://pusher.com)
// - Ably (https://ably.com)
// - Supabase Realtime (https://supabase.com/realtime)
// - Vercel's built-in WebSocket support (experimental)

import { Server } from 'socket.io';

export const setupSocket = (io: Server) => {
  // Only works in local development with custom server
  if (process.env.NODE_ENV === 'development') {
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Handle messages
      socket.on('message', (msg: { text: string; senderId: string }) => {
        // Echo: broadcast message only the client who send the message
        socket.emit('message', {
          text: `Echo: ${msg.text}`,
          senderId: 'system',
          timestamp: new Date().toISOString(),
        });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });

      // Send welcome message
      socket.emit('message', {
        text: 'Welcome to WebSocket Echo Server!',
        senderId: 'system',
        timestamp: new Date().toISOString(),
      });
    });
  }
};