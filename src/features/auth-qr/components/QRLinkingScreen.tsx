'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { QrCode, RefreshCw, Smartphone, Clock, CheckCircle, XCircle } from 'lucide-react'

interface QRSessionData {
  qrSessionId: string
  qrCodeImage: string
  expiresAt: string
  deviceInfo?: string
  provider?: 'baileys' | 'local'
}

interface QRStatusData {
  status: 'PENDING' | 'SCANNED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED'
  linkedToken?: string
  deviceInfo?: string
  expiresAt: string
}

export default function QRLinkingScreen({ onSuccess }: { onSuccess: (token: string) => void }) {
  const [qrData, setQrData] = useState<QRSessionData | null>(null)
  const [status, setStatus] = useState<QRStatusData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)

  const simulateQRScan = async () => {
    if (!qrData) return

    try {
      const response = await fetch('/api/demo/simulate-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrSessionId: qrData.qrSessionId
        })
      })

      const result = await response.json()
      
      if (result.success) {
        console.log('Demo simulation started:', result.message)
      } else {
        setError(result.error || 'Failed to simulate QR scan')
      }
    } catch (err) {
      setError('Failed to simulate QR scan')
    }
  }

  const generateQR = async () => {
    setLoading(true)
    setError(null)
    setPolling(true)
    
    try {
      const response = await fetch('/api/v1/auth/qr-session/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceInfo: navigator.userAgent || 'Unknown Device'
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setQrData(result.data)
        setStatus({
          status: 'PENDING',
          expiresAt: result.data.expiresAt
        })
      } else {
        setError(result.error || 'Failed to generate QR code')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const checkStatus = async () => {
    if (!qrData) return

    try {
      const response = await fetch(`/api/v1/auth/qr-session/status/${qrData.qrSessionId}`)
      const result = await response.json()

      if (result.success) {
        setStatus(result.data)
        
        if (result.data.status === 'COMPLETED' && result.data.linkedToken) {
          setPolling(false)
          // Store token in localStorage
          localStorage.setItem('crm_refresh_token', result.data.linkedToken)
          onSuccess(result.data.linkedToken)
        } else if (result.data.status === 'EXPIRED') {
          setPolling(false)
        }
      } else if (result?.data?.status === 'EXPIRED') {
        setStatus({ status: 'EXPIRED', expiresAt: qrData.expiresAt })
        setPolling(false)
      }
    } catch (err) {
      console.error('Status check error:', err)
    }
  }

  // Poll for status updates
  useEffect(() => {
    if (!polling || !qrData) return

    const interval = setInterval(checkStatus, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [polling, qrData])

  // Live QR rotation via SSE for Baileys provider
  useEffect(() => {
    if (!qrData || qrData.provider !== 'baileys') return
    
    const es = new EventSource(`/api/v1/auth/qr-session/stream/${qrData.qrSessionId}`)
    
    es.addEventListener('qr', (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data)
        if (payload?.qrDataUrl) {
          setQrData(prev => prev ? { ...prev, qrCodeImage: payload.qrDataUrl } : prev)
        }
      } catch {}
    })
    
    es.addEventListener('linked', (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data)
        if (payload?.status === 'COMPLETED') {
          setStatus(prev => prev ? { ...prev, status: 'COMPLETED' } : null)
          setPolling(false)
          // Trigger status check to get the token
          checkStatus()
        }
      } catch {}
    })
    
    es.addEventListener('status', (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data)
        if (payload?.message) {
          console.log('WhatsApp status:', payload.message)
        }
      } catch {}
    })
    
    es.addEventListener('end', () => {
      es.close()
    })
    
    es.onerror = () => {
      es.close()
    }
    
    return () => es.close()
  }, [qrData?.qrSessionId, qrData?.provider])

  // Auto-generate QR on mount
  useEffect(() => {
    generateQR()
  }, [])

  const getStatusIcon = () => {
    switch (status?.status) {
      case 'PENDING':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'SCANNED':
        return <Smartphone className="w-4 h-4 text-blue-500" />
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'EXPIRED':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <QrCode className="w-4 h-4" />
    }
  }

  const getStatusMessage = () => {
    switch (status?.status) {
      case 'PENDING':
        return 'Waiting for QR code to be scanned...'
      case 'SCANNED':
        return 'QR code scanned! Please confirm on your device.'
      case 'COMPLETED':
        return 'Device linked successfully! Redirecting...'
      case 'EXPIRED':
        return 'QR code expired. Please generate a new one.'
      default:
        return 'Initializing...'
    }
  }

  const getStatusColor = () => {
    switch (status?.status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800'
      case 'SCANNED':
        return 'bg-blue-100 text-blue-800'
      case 'COMPLETED':
        return 'bg-green-100 text-green-800'
      case 'EXPIRED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <QrCode className="w-5 h-5" />
            Link Your Device
          </CardTitle>
          <CardDescription>
            Scan this QR code with your authenticated mobile app to link this device
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {/* QR Code Display */}
          <div className="w-64 h-64 mx-auto bg-slate-100 rounded-lg flex items-center justify-center border-2 border-dashed border-slate-300 overflow-hidden relative">
            {qrData ? (
              <>
                <img 
                  src={qrData.qrCodeImage} 
                  alt="QR Code for device linking"
                  className="w-full h-full object-contain p-2"
                />
                {qrData.provider === 'baileys' && (
                  <div className="absolute bottom-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    WhatsApp
                  </div>
                )}
              </>
            ) : (
              <div className="text-slate-500">
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <RefreshCw className="w-8 h-8 mx-auto animate-spin" />
                    <p className="text-xs">Connecting to WhatsApp...</p>
                  </div>
                ) : (
                  <QrCode className="w-16 h-16 mx-auto" />
                )}
              </div>
            )}
          </div>

          {/* Status Display */}
          {status && (
            <div className="space-y-2">
              <Badge className={getStatusColor()}>
                {getStatusIcon()}
                <span className="ml-1">{getStatusMessage()}</span>
              </Badge>
              
              {status.deviceInfo && (
                <p className="text-sm text-slate-600">
                  Device: {status.deviceInfo}
                </p>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 justify-center">
            <Button 
              variant="outline" 
              onClick={generateQR}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh QR
            </Button>
            
            {status?.status === 'PENDING' && (
              <Button 
                variant="secondary" 
                onClick={simulateQRScan}
                disabled={!qrData}
                className="gap-2"
              >
                <Smartphone className="w-4 h-4" />
                Simulate Scan
              </Button>
            )}
            
            {status?.status === 'SCANNED' && (
              <Button 
                variant="destructive" 
                onClick={() => setPolling(false)}
                className="gap-2"
              >
                <XCircle className="w-4 h-4" />
                Cancel
              </Button>
            )}
          </div>

          {/* Instructions */}
          <div className="text-xs text-slate-500 space-y-1">
            <p><strong>Demo Mode:</strong> Click "Simulate Scan" to test the flow</p>
            <p><strong>Real Mode:</strong></p>
            <p>1. Open your mobile app with QR scanner</p>
            <p>2. Scan the QR code above</p>
            <p>3. Confirm the device linking on your phone</p>
            <p>4. Wait for automatic redirect</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}