import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/lib/db'
import { generatePreferredQrImage } from '@/lib/qr'
import { qrConfig } from '@/lib/config'
import { logger } from '@/lib/logging'
import { qrGenerationRateLimiter } from '@/lib/middleware/rate-limit'

const generateQRSchema = z.object({
  deviceInfo: z.string().optional(),
})

// Ensure Node.js runtime for compatibility with ws/baileys when preferred provider is Baileys
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await qrGenerationRateLimiter(request);
  if (rateLimitResult) return rateLimitResult;

  try {
    const body = await request.json()
    const { deviceInfo } = generateQRSchema.parse(body)

    // Generate QR session
    const qrSessionId = uuidv4()
    const localPayload = {
      sessionId: qrSessionId,
      timestamp: new Date().toISOString(),
      type: 'device-linking'
    }
    const preferred = await generatePreferredQrImage({
      sessionId: qrSessionId,
      payloadIfLocal: localPayload,
      size: qrConfig.codeSize || 300,
    })

    // Create default tenant for demo purposes
    let tenant = await db.tenant.findFirst({
      where: { slug: 'demo' }
    })

    if (!tenant) {
      tenant = await db.tenant.create({
        data: {
          name: 'Demo Organization',
          slug: 'demo',
          plan: 'FREE',
          maxUsers: 10
        }
      })
    }

    // Create QR session record
    const qrSession = await db.qRSession.create({
      data: {
        id: qrSessionId,
        status: 'PENDING',
        qrCodeData: preferred.dataUrl,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        deviceInfo: deviceInfo || 'Unknown Device',
        tenantId: tenant.id,
  // Persist legacy enum while UI/client uses preferred.provider; stream route uses global config
  provider: preferred.provider === 'baileys' ? 'BAILEYS' : 'LOCAL'
      }
    })

    // Log provider used for observability
    logger.info('QR session generated', { sessionId: qrSessionId, provider: preferred.provider })

    return NextResponse.json({
      success: true,
      data: {
        qrSessionId: qrSession.id,
        qrCodeImage: qrSession.qrCodeData,
        expiresAt: qrSession.expiresAt,
        deviceInfo: qrSession.deviceInfo,
        provider: preferred.provider
      }
    })

  } catch (error) {
    console.error('QR generation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to generate QR code'
    }, { status: 500 })
  }
}