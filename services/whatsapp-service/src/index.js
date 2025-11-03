import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pino from 'pino';
import { startSession, getSession, hasSession, logoutSession } from './sessionManager.js';

dotenv.config();
const log = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Start or fetch a session
app.post('/sessions/:id/start', async (req, res) => {
  const { id } = req.params;
  try {
    const s = await startSession(id);
    res.json({ ok: true, status: s.status });
  } catch (e) {
    log.error({ err: e }, 'Failed to start session');
    res.status(500).json({ ok: false, error: 'failed_to_start' });
  }
});

// Stream QR via SSE
app.get('/sessions/:id/qr', async (req, res) => {
  const { id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const state = await startSession(id);
    const send = (event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('status', { status: state.status });

    const interval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 15000);

    const ticker = setInterval(() => {
      const s = getSession(id);
      if (!s) {
        clearInterval(ticker);
        clearInterval(interval);
        send('end', { reason: 'no_session' });
        res.end();
        return;
      }
      if (s.qr) send('qr', { qrDataUrl: s.qr });
      if (s.status === 'READY' || s.status === 'AUTHENTICATED') {
        clearInterval(ticker);
        clearInterval(interval);
        send('linked', { status: 'COMPLETED' });
        res.end();
      }
    }, 1000);

    req.on('close', () => {
      clearInterval(ticker);
      clearInterval(interval);
    });
  } catch (e) {
    res.status(500).end();
  }
});

// Logout
app.post('/sessions/:id/logout', async (req, res) => {
  const { id } = req.params;
  await logoutSession(id);
  res.json({ ok: true });
});

const port = process.env.PORT || 4000;
app.listen(port, () => log.info({ port }, 'WhatsApp service listening'));
