import { useDatabaseAuthState } from './baileys-db-auth'

// Lazy import baileys to avoid loading cost if not used
let makeWASocket: any

async function loadBaileys() {
  if (!makeWASocket) {
    const mod = await import('@whiskeysockets/baileys')
    makeWASocket = (mod as any).default || (mod as any).makeWASocket || (mod as any).makeWASocket
  }
}

export type BaileysQRResult = {
  qr: string
}

export async function getWhatsAppLoginQR(options: {
  sessionId: string
  timeoutMs?: number
  authDir?: string
}): Promise<BaileysQRResult> {
  await loadBaileys()

  const timeoutMs = options.timeoutMs ?? 5000
  // Use database-backed auth state (Vercel-compatible)
  const { state, saveCreds } = await useDatabaseAuthState(options.sessionId)

  return new Promise<BaileysQRResult>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('Baileys QR timeout'))
      }
    }, timeoutMs)

    const sock = makeWASocket({
      printQRInTerminal: false,
      auth: state,
      // Keep it quiet; Baileys uses pino by default if provided
      browser: ['QR SaaS', 'Desktop', '1.0.0'],
    })

    const cleanup = () => {
      try { sock.ev.removeAllListeners?.() } catch {}
      try { (sock as any).ws?.close?.() } catch {}
      try { (sock as any).end?.() } catch {}
    }

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update: any) => {
      const { qr, connection, lastDisconnect } = update || {}
      if (!settled && qr) {
        settled = true
        clearTimeout(timer)
        // Return the raw QR string; caller renders it
        resolve({ qr })
        // We can safely cleanup after providing QR
        setTimeout(cleanup, 0)
      }

      if (connection === 'close') {
        // If closed before QR, surface error
        if (!settled) {
          settled = true
          clearTimeout(timer)
          const err = (lastDisconnect && lastDisconnect.error) || new Error('Baileys connection closed')
          reject(err)
        }
        cleanup()
      }
    })
  })
}

export async function startWhatsAppQRStream(options: {
  sessionId: string
  authDir?: string
  onQR: (qr: string) => void
  onOpen?: () => void
  onClose?: (error?: any) => void
}) {
  await loadBaileys()

  // Use database-backed auth state (Vercel-compatible)
  const { state, saveCreds } = await useDatabaseAuthState(options.sessionId)
  const sock = makeWASocket({
    printQRInTerminal: false,
    auth: state,
    browser: ['QR SaaS', 'Desktop', '1.0.0'],
  })

  const cleanup = () => {
    try { sock.ev.removeAllListeners?.() } catch {}
    try { (sock as any).ws?.close?.() } catch {}
    try { (sock as any).end?.() } catch {}
    options.onClose?.()
  }

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', (update: any) => {
    const { qr, connection, lastDisconnect } = update || {}
    if (qr) {
      options.onQR(qr)
    }
    if (connection === 'open') {
      try { options.onOpen?.() } catch {}
    }
    if (connection === 'close') {
      options.onClose?.(lastDisconnect?.error)
    }
  })

  return { close: cleanup }
}
