import * as QRCode from 'qrcode'
import { whatsappConfig } from '@/lib/config'

export async function renderQrDataUrl(qrText: string, opts?: { size?: number }): Promise<string> {
  const width = opts?.size ?? 300
  return QRCode.toDataURL(qrText, {
    errorCorrectionLevel: 'H',
    type: 'image/png',
    width,
    margin: 2,
    color: { dark: '#000000', light: '#FFFFFF' }
  })
}

export async function generatePreferredQrImage(params: {
  sessionId: string
  payloadIfLocal: any
  size?: number
}): Promise<{ dataUrl: string; provider: 'baileys' | 'local' | 'whatsapp-web-js' }> {
  const { sessionId, payloadIfLocal, size } = params

  // For Baileys: return a placeholder immediately
  // The real QR will be streamed via SSE to keep the connection alive
  if (whatsappConfig.provider === 'baileys') {
    // Return a placeholder that instructs to wait for SSE stream
    const placeholderText = JSON.stringify({
      type: 'baileys-placeholder',
      sessionId,
      message: 'Connecting to WhatsApp...'
    })
    const dataUrl = await renderQrDataUrl(placeholderText, { size })
    return { dataUrl, provider: 'baileys' }
  }

  // For whatsapp-web.js service: return placeholder and stream via SSE
  if (whatsappConfig.provider === 'whatsapp-web-js') {
    const placeholderText = JSON.stringify({
      type: 'whatsapp-web-js-placeholder',
      sessionId,
      message: 'Connecting to WhatsApp...'
    })
    const dataUrl = await renderQrDataUrl(placeholderText, { size })
    return { dataUrl, provider: 'whatsapp-web-js' }
  }

  // Fallback: local QR content
  const localText = typeof payloadIfLocal === 'string' ? payloadIfLocal : JSON.stringify(payloadIfLocal)
  const dataUrl = await renderQrDataUrl(localText, { size })
  return { dataUrl, provider: 'local' }
}
