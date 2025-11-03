"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function GlobalAnalytics() {
  const [providerStats, setProviderStats] = useState<{ BAILEYS: number; LOCAL: number; TOTAL: number } | null>(null)
  useEffect(() => {
    fetch('/api/v1/auth/qr-session/provider-stats').then(r => r.json()).then(json => {
      if (json?.success && json?.data?.counts) setProviderStats(json.data.counts)
    }).catch(() => {})
  }, [])
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="w-4 h-4"/>Usage</CardTitle>
          <CardDescription>High-level platform usage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-slate-500">Baileys</div>
              <div className="text-2xl font-semibold">{providerStats?.BAILEYS ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Local</div>
              <div className="text-2xl font-semibold">{providerStats?.LOCAL ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-2xl font-semibold">{providerStats?.TOTAL ?? '-'}</div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="w-4 h-4"/>Growth</CardTitle>
          <CardDescription>Tenants and users growth</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-40 bg-slate-100 rounded-md flex items-center justify-center text-slate-500">
            Chart placeholder
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
