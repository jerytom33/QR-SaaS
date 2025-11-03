'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, User, Shield, Building2, Crown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface DemoAccount {
  email: string
  name: string
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER'
  tenant: {
    name: string
    slug: string
  }
}

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onLoginSuccess: (userData: any) => void
}

const roleIcons = {
  SUPER_ADMIN: Crown,
  TENANT_ADMIN: Shield,
  USER: User,
}

const roleColors = {
  SUPER_ADMIN: 'bg-purple-100 text-purple-700 border-purple-200',
  TENANT_ADMIN: 'bg-blue-100 text-blue-700 border-blue-200',
  USER: 'bg-green-100 text-green-700 border-green-200',
}

const roleLabels = {
  SUPER_ADMIN: 'Super Admin',
  TENANT_ADMIN: 'Tenant Admin',
  USER: 'User',
}

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState<string | null>(null)
  const { toast } = useToast()

  // Fetch demo accounts when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchDemoAccounts()
    }
  }, [isOpen])

  const fetchDemoAccounts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/auth/demo-login')
      const data = await response.json()
      
      if (response.ok) {
        // API responses are wrapped with { success, data: { ... } }
        const accounts: DemoAccount[] = data?.data?.accounts ?? []
        setDemoAccounts(accounts)
      } else {
        toast({
          title: "Error",
          description: data?.message || "Failed to load demo accounts",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error fetching demo accounts:', error)
      toast({
        title: "Error",
        description: "Failed to load demo accounts",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (email: string) => {
    try {
      setLoginLoading(email)
      
      const response = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        // API response is wrapped: { success, data: { user, tokens } }
        const payload = data?.data
        const user = payload?.user
        const tokens = payload?.tokens

        // Store tokens in localStorage (guarded)
        if (tokens?.accessToken) {
          localStorage.setItem('crm_access_token', tokens.accessToken)
        }
        if (tokens?.refreshToken) {
          localStorage.setItem('crm_refresh_token', tokens.refreshToken)
        }
        if (user) {
          localStorage.setItem('crm_user_data', JSON.stringify(user))
        }

        toast({
          title: "Login Successful",
          description: `Welcome back, ${user?.name ?? 'User'}!`,
        })

        onLoginSuccess(user)
        onClose()
      } else {
        toast({
          title: "Login Failed",
          description: data?.message || data?.error || "Authentication failed",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Login error:', error)
      toast({
        title: "Login Failed",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setLoginLoading(null)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Demo Login
          </DialogTitle>
          <DialogDescription>
            Select a demo account to explore the platform. No passwords required!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="ml-2">Loading demo accounts...</span>
            </div>
          ) : (
            <div className="grid gap-3">
              {demoAccounts.map((account) => {
                const Icon = roleIcons[account.role]
                const isLoading = loginLoading === account.email
                
                return (
                  <Card 
                    key={account.email} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => !isLoading && handleDemoLogin(account.email)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                            <Icon className="w-5 h-5 text-slate-600" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{account.name}</CardTitle>
                            <CardDescription className="text-sm">
                              {account.email}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${roleColors[account.role]}`}
                          >
                            {roleLabels[account.role]}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {account.tenant.name}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Button 
                        className="w-full" 
                        disabled={isLoading}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDemoLogin(account.email)
                        }}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Logging in...
                          </>
                        ) : (
                          `Login as ${account.name}`
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          <div className="border-t pt-4">
            <div className="text-sm text-slate-600 space-y-2">
              <p className="font-medium">Demo Account Roles:</p>
              <ul className="space-y-1 text-xs">
                <li className="flex items-center gap-2">
                  <Crown className="w-3 h-3 text-purple-600" />
                  <strong>Super Admin:</strong> Can manage all tenants and global settings
                </li>
                <li className="flex items-center gap-2">
                  <Shield className="w-3 h-3 text-blue-600" />
                  <strong>Tenant Admin:</strong> Full access within their organization
                </li>
                <li className="flex items-center gap-2">
                  <User className="w-3 h-3 text-green-600" />
                  <strong>User:</strong> Standard access to CRM features
                </li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}