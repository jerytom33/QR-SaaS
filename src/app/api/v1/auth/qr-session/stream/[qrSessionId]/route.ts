import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { whatsappConfig } from '@/lib/config'
import { startWhatsAppQRStream } from '@/lib/qr/providers/baileys'
import { renderQrDataUrl } from '@/lib/qr'

// Ensure Node.js runtime for ws/baileys compatibility
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrSessionId: string }> }
) {
  const { qrSessionId } = await params

  const qrSession = await db.qRSession.findUnique({ where: { id: qrSessionId } })
  if (!qrSession) {
    return new Response(JSON.stringify({ success: false, error: 'QR session not found' }), { status: 404 })
  }

  if (new Date() > qrSession.expiresAt) {
    return new Response(JSON.stringify({ success: false, error: 'QR code expired' }), { status: 410 })
  }

  const stream = new ReadableStream({
    start: async (controller) => {
      const encoder = new TextEncoder()
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 15000)

      let closer: { close: () => void } | null = null
      let closed = false
      const safeClose = (reason: string) => {
        if (closed) return
        closed = true
        try { send('end', { reason }) } catch {}
        try { closer?.close() } catch {}
        clearInterval(heartbeat)
        clearInterval(statusCheck)
        try { controller.close() } catch {}
      }

      const provider = qrSession.provider || 'LOCAL'
      if (provider === 'BAILEYS' && whatsappConfig.provider === 'baileys') {
        // Send initial connecting message
        send('status', { message: 'Connecting to WhatsApp...' })
        
        closer = await startWhatsAppQRStream({
          sessionId: qrSessionId,
          authDir: whatsappConfig.authDir,
          onQR: async (qr: string) => {
            const dataUrl = await renderQrDataUrl(qr, { size: 300 })
            send('qr', { qrDataUrl: dataUrl })
          },
          onOpen: async () => {
            try {
              // Mark scanned if pending
              const current = await db.qRSession.findUnique({ where: { id: qrSessionId } })
              if (!current) return
              if (new Date() > current.expiresAt) return safeClose('expired')
              if (current.status === 'PENDING') {
                await db.qRSession.update({ where: { id: qrSessionId }, data: { status: 'SCANNED' } })
              }

              // Complete linking on server side (demo behavior)
              const { v4: uuidv4 } = await import('uuid')
              const refreshToken = uuidv4() + '-' + Date.now()
              const hashedToken = Buffer.from(refreshToken).toString('base64')

              // Ensure demo profile exists
              let profile = await db.profile.findFirst({ where: { email: 'demo@crmflow.com' } })
              if (!profile) {
                profile = await db.profile.create({
                  data: {
                    userId: uuidv4(),
                    email: 'demo@crmflow.com',
                    name: 'Demo User',
                    role: 'TENANT_ADMIN',
                    tenantId: current.tenantId,
                  },
                })
              }

              // Create linked device
              await db.linkedDevice.create({
                data: {
                  userId: profile.id,
                  tenantId: current.tenantId,
                  deviceInfo: 'WhatsApp Device',
                  hashedRefreshToken: hashedToken,
                  lastUsedAt: new Date(),
                },
              })

              // Update session as completed
              await db.qRSession.update({
                where: { id: qrSessionId },
                data: {
                  status: 'COMPLETED',
                  linkedToken: refreshToken,
                  deviceInfo: 'WhatsApp Device',
                },
              })

              // Notify client immediately
              send('linked', { status: 'COMPLETED' })
            } catch (err) {
              // In case of error, let polling detect current state
            }
          },
          onClose: () => {
            // signal end of stream
            safeClose('connection_closed')
          }
        })
      } else {
        // Non-Baileys provider: emit current QR and close
        send('qr', { qrDataUrl: qrSession.qrCodeData })
        safeClose('no_rotation')
        return
      }

      // Periodic status check: end stream when session completes/expires/cancelled
      const statusCheck = setInterval(async () => {
        if (closed) return
        try {
          const latest = await db.qRSession.findUnique({ where: { id: qrSessionId }, select: { status: true } })
          const st = latest?.status
          if (!st || st === 'COMPLETED') return safeClose('completed')
          if (st === 'EXPIRED') return safeClose('expired')
          if (st === 'CANCELLED') return safeClose('cancelled')
        } catch {
          // ignore transient errors
        }
      }, 2000)

      // Close handling when client disconnects
      const abort = (request as any).signal
      const onAbort = () => {
        safeClose('client_abort')
      }
      if (abort && 'addEventListener' in abort) {
        abort.addEventListener('abort', onAbort)
      }
    },
    cancel: () => {
      // no-op; handled by abort above
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  })
}
