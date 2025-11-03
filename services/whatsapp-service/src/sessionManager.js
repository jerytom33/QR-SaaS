import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import pino from 'pino';

const log = pino({ level: process.env.LOG_LEVEL || 'info' });

// In-memory session registry. For production, persist elsewhere.
const sessions = new Map();

export function hasSession(id) {
  return sessions.has(id);
}

export function getSession(id) {
  return sessions.get(id);
}

export async function startSession(id) {
  if (sessions.has(id)) return sessions.get(id);

  // Use LocalAuth to persist credentials under .wwebjs_auth
  const client = new Client({
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    },
    authStrategy: new LocalAuth({ clientId: id })
  });

  const state = { id, client, status: 'INIT', qr: null };
  sessions.set(id, state);

  client.on('qr', async (qr) => {
    state.qr = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'H', width: 300 });
    state.status = 'QR';
  });

  client.on('ready', () => {
    state.status = 'READY';
  });

  client.on('authenticated', () => {
    state.status = 'AUTHENTICATED';
  });

  client.on('disconnected', (reason) => {
    log.warn({ id, reason }, 'WhatsApp disconnected');
    state.status = 'DISCONNECTED';
    try { client.destroy(); } catch {}
    sessions.delete(id);
  });

  await client.initialize();
  return state;
}

export async function logoutSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    await s.client.logout();
    await s.client.destroy();
  } catch {}
  sessions.delete(id);
}
