import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const scanSchema = z.object({
  qrSessionId: z.string().uuid(),
  userId: z.string().optional(), // In real app, this would come from auth token
})

// Ensure Node.js runtime for consistency with other QR routes
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { qrSessionId } = scanSchema.parse(body)

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
      // Mark expired for consistency
      await db.qRSession.update({ where: { id: qrSessionId }, data: { status: 'EXPIRED' } })
      return NextResponse.json({
        success: false,
        error: 'QR code expired'
      }, { status: 410 })
    }

    // If still pending, flip to SCANNED; else, return current status
    if (qrSession.status === 'PENDING') {
      await db.qRSession.update({
        where: { id: qrSessionId },
        data: { status: 'SCANNED' }
      })
      return NextResponse.json({
        success: true,
        data: {
          status: 'SCANNED',
          message: 'QR code scanned successfully. Please confirm linking on your device.'
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: { status: qrSession.status, message: 'Already processed' }
    })
  } catch (error) {
    console.error('QR scan error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: 'Failed to scan QR code' }, { status: 500 })
  }
}