import fs from 'fs'
import path from 'path'
import { whatsappConfig } from '@/lib/config'

export function removeBaileysSessionDir(sessionId: string) {
  try {
    const baseAuthDir = whatsappConfig.authDir || path.join(process.cwd(), '.wa-auth')
    const sessionDir = path.join(baseAuthDir, `session-${sessionId}`)
    fs.rmSync(sessionDir, { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}
