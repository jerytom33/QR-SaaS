// server.ts - Next.js Standalone + Socket.IO
import { setupSocket } from '@/lib/socket';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';

// Gracefully handle Windows EPERM on Next trace file during dev
process.on('uncaughtException', (err: any) => {
  const msg = typeof err?.message === 'string' ? err.message : '';
  const code = (err && (err as any).code) || '';
  const path = (err && (err as any).path) || '';
  if (
    process.env.NODE_ENV !== 'production' &&
    code === 'EPERM' &&
    (msg.includes('trace') || String(path).includes('trace')) &&
    (msg.includes('.next') || String(path).includes('.next'))
  ) {
    console.warn('[dev] Suppressed EPERM for Next trace file:', path || msg);
    return; // swallow known benign error
  }
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  const msg = typeof reason?.message === 'string' ? reason.message : '';
  const code = (reason && (reason as any).code) || '';
  const path = (reason && (reason as any).path) || '';
  if (
    process.env.NODE_ENV !== 'production' &&
    code === 'EPERM' &&
    (msg.includes('trace') || String(path).includes('trace')) &&
    (msg.includes('.next') || String(path).includes('.next'))
  ) {
    console.warn('[dev] Suppressed EPERM (rejection) for Next trace file:', path || msg);
    return; // swallow known benign error
  }
  console.error('Unhandled rejection:', reason);
});

const dev = process.env.NODE_ENV !== 'production';
const currentPort = 3000;
const hostname = '0.0.0.0';

// Custom server with Socket.IO integration
async function createCustomServer() {
  try {
    // Create Next.js app
    const nextApp = next({ 
      dev,
      dir: process.cwd(),
      // Use custom dist dir in dev to avoid Windows file locking; prod uses standard .next
      conf: dev ? { distDir: './.next-dev' } : { distDir: './.next' }
    });

    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();

    // Create HTTP server that will handle both Next.js and Socket.IO
    const server = createServer((req, res) => {
      // Skip socket.io requests from Next.js handler
      if (req.url?.startsWith('/api/socketio')) {
        return;
      }
      handle(req, res);
    });

    // Setup Socket.IO
    const io = new Server(server, {
      path: '/api/socketio',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    setupSocket(io);

    // Start the server
    server.listen(currentPort, hostname, () => {
      console.log(`> Ready on http://${hostname}:${currentPort}`);
      console.log(`> Socket.IO server running at ws://${hostname}:${currentPort}/api/socketio`);
    });

  } catch (err) {
    console.error('Server startup error:', err);
    process.exit(1);
  }
}

// Start the server
createCustomServer();
