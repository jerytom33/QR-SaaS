"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, Eye, Ban, Trash2, MoreHorizontal, Building2 } from 'lucide-react'

export default function TenantManagement() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Input placeholder="Search tenants..." className="max-w-sm" />
        <Button variant="outline" className="gap-2"><Search className="w-4 h-4"/>Search</Button>
        <div className="flex-1" />
        <Button className="gap-2"><Plus className="w-4 h-4"/>New Tenant</Button>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-linear-to-br from-indigo-500 to-violet-500 rounded-lg flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-sm">Acme Corp {i}</CardTitle>
                  <CardDescription>acme-{i}.example.com</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4"/></Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1"><Eye className="w-3 h-3"/>View</Button>
                <Button variant="outline" size="sm" className="gap-1"><Ban className="w-3 h-3"/>Suspend</Button>
                <Button variant="destructive" size="sm" className="gap-1"><Trash2 className="w-3 h-3"/>Delete</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
