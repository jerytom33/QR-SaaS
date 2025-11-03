'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { QrCode, Smartphone, Users, Building2, TrendingUp, Shield, Lock, Zap, Globe, CheckCircle, LogIn } from 'lucide-react'
import QRLinkingScreen from '@/features/auth-qr/components/QRLinkingScreen'
import Dashboard from '@/features/dashboard/components/Dashboard'
import LoginModal from '@/components/LoginModal'

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [userData, setUserData] = useState(null)

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('crm_refresh_token')
    const storedUserData = localStorage.getItem('crm_user_data')
    
    if (token && storedUserData) {
      setIsAuthenticated(true)
      setUserData(JSON.parse(storedUserData))
    }
  }, [])

  const handleQRSuccess = (token: string) => {
    setIsAuthenticated(true)
    setShowQRModal(false)
  }

  const handleLoginSuccess = (user: any) => {
    setIsAuthenticated(true)
    setUserData(user)
    setShowLoginModal(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('crm_refresh_token')
    localStorage.removeItem('crm_access_token')
    localStorage.removeItem('crm_user_data')
    setIsAuthenticated(false)
    setUserData(null)
  }

  // Show dashboard if authenticated
  if (isAuthenticated) {
    return <Dashboard />
  }

  // Show QR modal if requested
  if (showQRModal) {
    return <QRLinkingScreen onSuccess={handleQRSuccess} />
  }

  // Show landing page
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">CRMFlow</span>
            <Badge variant="secondary" className="ml-2">Enterprise</Badge>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowLoginModal(true)} variant="outline" className="gap-2">
              <LogIn className="w-4 h-4" />
              Demo Login
            </Button>
            <Button onClick={() => setShowQRModal(true)} className="gap-2">
              <QrCode className="w-4 h-4" />
              Link Device
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <Badge variant="outline" className="mb-4">
            <Shield className="w-3 h-3 mr-1" />
            Enterprise-Grade Multi-Tenant CRM
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
            Revolutionary CRM with
            <span className="text-primary"> QR Authentication</span>
          </h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed">
            Experience the future of secure access with our WhatsApp-style QR code linking. 
            No more timeouts, no more password fatigue - just seamless, persistent sessions 
            across all your devices.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => setShowLoginModal(true)} className="gap-2">
              <LogIn className="w-5 h-5" />
              Try Demo Login
            </Button>
            <Button size="lg" onClick={() => setShowQRModal(true)} variant="outline" className="gap-2">
              <Smartphone className="w-5 h-5" />
              QR Device Link
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Core Features</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Everything you need to manage your customer relationships, with enterprise-grade security
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <QrCode className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle>QR Device Linking</CardTitle>
              <CardDescription>
                Revolutionary authentication with persistent, no-timeout sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  WhatsApp-style QR scanning
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Long-lived refresh tokens
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Device management dashboard
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle>Contact Management</CardTitle>
              <CardDescription>
                Complete CRM functionality with custom fields and tags
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Custom field definitions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Advanced tagging system
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Company relationships
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle>Sales Pipelines</CardTitle>
              <CardDescription>
                Visual, drag-and-drop pipeline management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Customizable stages
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Visual drag-and-drop
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Deal tracking & analytics
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle>Multi-Tenancy</CardTitle>
              <CardDescription>
                Strict data isolation with Row Level Security
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Complete data isolation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  RLS policies enforced
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Tenant-specific API keys
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-red-600" />
              </div>
              <CardTitle>Connection API</CardTitle>
              <CardDescription>
                RESTful API for external integrations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Tenant-specific endpoints
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  API key management
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Webhook support
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <Globe className="w-6 h-6 text-indigo-600" />
              </div>
              <CardTitle>Enterprise Ready</CardTitle>
              <CardDescription>
                Built for scale with comprehensive admin tools
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Super-admin dashboard
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Subscription management
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Global analytics
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your CRM?</h2>
          <p className="text-xl mb-8 opacity-90">
            Join the revolution in customer relationship management
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" onClick={() => setShowLoginModal(true)} className="gap-2">
              <LogIn className="w-5 h-5" />
              Demo Login
            </Button>
            <Button size="lg" variant="outline" onClick={() => setShowQRModal(true)} className="gap-2">
              <QrCode className="w-5 h-5" />
              QR Device Link
            </Button>
          </div>
        </div>
      </section>

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  )
}