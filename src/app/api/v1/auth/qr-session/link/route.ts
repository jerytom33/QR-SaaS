import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/lib/db'
import { removeBaileysSessionDir } from '@/lib/qr/cleanup'

const linkSchema = z.object({
  qrSessionId: z.string().uuid(),
  userId: z.string().optional(),
  deviceInfo: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { qrSessionId, userId, deviceInfo } = linkSchema.parse(body)

    // Find QR session
    const qrSession = await db.qRSession.findUnique({
      where: { id: qrSessionId }
    })

    if (!qrSession) {
      return NextResponse.json({
        success: false,
        error: 'QR session not found'
      }, { status: 404 })
    }

    // Check if expired
    if (new Date() > qrSession.expiresAt) {
      return NextResponse.json({
        success: false,
        error: 'QR code expired'
      }, { status: 410 })
    }

    // Check if scanned
    if (qrSession.status !== 'SCANNED') {
      return NextResponse.json({
        success: false,
        error: 'QR code must be scanned before linking'
      }, { status: 400 })
    }

    // Generate long-lived refresh token
    const refreshToken = uuidv4() + '-' + Date.now()
    const hashedToken = Buffer.from(refreshToken).toString('base64')

    // Create or find demo user
    let profile = await db.profile.findFirst({
      where: { email: 'demo@crmflow.com' }
    })

    if (!profile) {
      // Create demo user
      profile = await db.profile.create({
        data: {
          userId: uuidv4(),
          email: 'demo@crmflow.com',
          name: 'Demo User',
          role: 'TENANT_ADMIN',
          tenantId: qrSession.tenantId
        }
      })
    }

    // Create linked device record
    const linkedDevice = await db.linkedDevice.create({
      data: {
        userId: profile.id,
        tenantId: qrSession.tenantId,
        deviceInfo: deviceInfo || 'Web Browser',
        hashedRefreshToken: hashedToken,
        lastUsedAt: new Date()
      }
    })

    // Update QR session with the token
    await db.qRSession.update({
      where: { id: qrSessionId },
      data: {
        status: 'COMPLETED',
        linkedToken: refreshToken,
        deviceInfo: deviceInfo || 'Web Browser'
      }
    })

    // Note: Do NOT remove Baileys auth state on successful link.
    // Keeping the auth directory allows the WhatsApp session to remain usable
    // after QR linking. Cleanup is handled on expiry/cancellation paths.

    return NextResponse.json({
      success: true,
      data: {
        status: 'COMPLETED',
        message: 'Device linked successfully',
        deviceId: linkedDevice.id
      }
    })

  } catch (error) {
    console.error('QR link error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to link device'
    }, { status: 500 })
  }
}