import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const [baileys, local, total] = await Promise.all([
      db.qRSession.count({ where: { provider: 'BAILEYS' } }),
      db.qRSession.count({ where: { provider: 'LOCAL' } }),
      db.qRSession.count({}),
    ])

    return NextResponse.json({
      success: true,
      data: {
        counts: { BAILEYS: baileys, LOCAL: local, TOTAL: total }
      }
    })
  } catch (error) {
    console.error('provider-stats error:', error)
    return NextResponse.json({ success: false, error: 'Failed to get stats' }, { status: 500 })
  }
}
