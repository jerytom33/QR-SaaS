import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { removeBaileysSessionDir } from '@/lib/qr/cleanup'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ qrSessionId: string }> }
) {
  try {
    const { qrSessionId } = await params

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
      await db.qRSession.update({
        where: { id: qrSessionId },
        data: { status: 'EXPIRED' }
      })
      // Best-effort cleanup of Baileys auth state for this session
      removeBaileysSessionDir(qrSessionId)

      return NextResponse.json({
        success: false,
        error: 'QR code expired',
        data: { status: 'EXPIRED' }
      }, { status: 410 })
    }

    return NextResponse.json({
      success: true,
      data: {
        status: qrSession.status,
        linkedToken: qrSession.linkedToken,
        deviceInfo: qrSession.deviceInfo,
        expiresAt: qrSession.expiresAt
      }
    })

  } catch (error) {
    console.error('QR status check error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to check QR status'
    }, { status: 500 })
  }
}