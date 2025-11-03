import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const simulateSchema = z.object({
  qrSessionId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { qrSessionId } = simulateSchema.parse(body)

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

    // Simulate the complete flow: scan -> link
    if (qrSession.status === 'PENDING') {
      // First scan
      await db.qRSession.update({
        where: { id: qrSessionId },
        data: { status: 'SCANNED' }
      })

      // Then link after a short delay
      setTimeout(async () => {
        try {
          const { v4: uuidv4 } = await import('uuid')
          const refreshToken = uuidv4() + '-' + Date.now()
          const hashedToken = Buffer.from(refreshToken).toString('base64')

          // Create or find demo user
          let profile = await db.profile.findFirst({
            where: { email: 'demo@crmflow.com' }
          })

          if (!profile) {
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
          await db.linkedDevice.create({
            data: {
              userId: profile.id,
              tenantId: qrSession.tenantId,
              deviceInfo: 'Demo Mobile Device',
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
              deviceInfo: 'Demo Mobile Device'
            }
          })
        } catch (error) {
          console.error('Demo simulation error:', error)
        }
      }, 2000) // 2 second delay to simulate real scanning

      return NextResponse.json({
        success: true,
        message: 'QR code scanned! Linking will complete in 2 seconds...',
        data: { status: 'SCANNED' }
      })
    }

    return NextResponse.json({
      success: true,
      data: { status: qrSession.status }
    })

  } catch (error) {
    console.error('Demo simulation error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 })
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to simulate QR scan'
    }, { status: 500 })
  }
}