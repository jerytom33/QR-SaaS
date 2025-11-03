"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Database, Globe, Activity } from 'lucide-react'

export default function SystemMonitoring() {
  const metrics = [
    { label: 'Database Health', value: 'OK', icon: Database },
    { label: 'API Latency', value: '142ms', icon: Activity },
    { label: 'Region', value: 'us-east-1', icon: Globe },
  ]

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {metrics.map((m, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><m.icon className="w-4 h-4"/>{m.label}</CardTitle>
            <CardDescription>Live metric</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{m.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
