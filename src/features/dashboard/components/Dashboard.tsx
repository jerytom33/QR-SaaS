'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Users, 
  Building2, 
  TrendingUp, 
  Phone, 
  Mail, 
  Calendar,
  BarChart3,
  Target,
  Activity,
  Settings,
  LogOut,
  Smartphone,
  Crown
} from 'lucide-react'
import ContactList from '@/features/crm-contacts/components/ContactList'
import PipelineBoard from '@/features/pipelines/components/PipelineBoard'
import ApiKeyManager from '@/features/api-management/components/ApiKeyManager'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [userData, setUserData] = useState<any>(null)

  // Get user data from localStorage
  useEffect(() => {
    const storedUserData = localStorage.getItem('crm_user_data')
    if (storedUserData) {
      setUserData(JSON.parse(storedUserData))
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('crm_refresh_token')
    localStorage.removeItem('crm_access_token')
    localStorage.removeItem('crm_user_data')
    window.location.reload()
  }

  const isSuperAdmin = userData?.role === 'SUPER_ADMIN'
  const isTenantAdmin = userData?.role === 'TENANT_ADMIN'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">CRMFlow</h1>
                <p className="text-sm text-slate-500">
                  {userData?.tenant?.name || 'Loading...'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {userData && (
                <div className="text-right">
                  <p className="text-sm font-medium">{userData.name}</p>
                  <Badge variant="secondary" className="text-xs">
                    {userData.role === 'SUPER_ADMIN' ? 'Super Admin' : 
                     userData.role === 'TENANT_ADMIN' ? 'Tenant Admin' : 'User'}
                  </Badge>
                </div>
              )}
              
              <Badge variant="outline" className="gap-1">
                <Smartphone className="w-3 h-3" />
                Demo Login
              </Badge>
              
              {isSuperAdmin && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open('/super-admin', '_blank')}
                  className="gap-2"
                >
                  <Crown className="w-4 h-4" />
                  Super Admin
                </Button>
              )}
              
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="companies">Companies</TabsTrigger>
            <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
            <TabsTrigger value="api">API Keys</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">2,543</div>
                  <p className="text-xs text-muted-foreground">
                    +12% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">47</div>
                  <p className="text-xs text-muted-foreground">
                    +5 from last week
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">$1.2M</div>
                  <p className="text-xs text-muted-foreground">
                    +23% from last month
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Activities</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">124</div>
                  <p className="text-xs text-muted-foreground">
                    +18 from last week
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activities</CardTitle>
                  <CardDescription>Latest updates from your team</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { icon: Phone, title: 'Call with John Doe', time: '2 hours ago', color: 'text-blue-500' },
                      { icon: Mail, title: 'Email sent to Jane Smith', time: '4 hours ago', color: 'text-green-500' },
                      { icon: Calendar, title: 'Meeting scheduled', time: '1 day ago', color: 'text-purple-500' },
                      { icon: Target, title: 'Deal moved to proposal', time: '2 days ago', color: 'text-orange-500' },
                    ].map((activity, index) => (
                      <div key={index} className="flex items-center space-x-4">
                        <activity.icon className={`w-4 h-4 ${activity.color}`} />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{activity.title}</p>
                          <p className="text-xs text-slate-500">{activity.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sales Pipeline</CardTitle>
                  <CardDescription>Current deal progression</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { stage: 'Lead', count: 12, value: '$240K', color: 'bg-blue-500' },
                      { stage: 'Qualified', count: 8, value: '$320K', color: 'bg-green-500' },
                      { stage: 'Proposal', count: 5, value: '$450K', color: 'bg-yellow-500' },
                      { stage: 'Negotiation', count: 3, value: '$180K', color: 'bg-orange-500' },
                    ].map((stage, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${stage.color}`}></div>
                          <span className="text-sm font-medium">{stage.stage}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{stage.count} deals</div>
                          <div className="text-xs text-slate-500">{stage.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="contacts">
            <ContactList />
          </TabsContent>

          <TabsContent value="companies">
            <Card>
              <CardHeader>
                <CardTitle>Companies</CardTitle>
                <CardDescription>Manage your business accounts and organizations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">Companies Module</h3>
                  <p className="text-slate-500 mb-4">
                    Company management features coming soon
                  </p>
                  <Button>Add Company</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipelines">
            <PipelineBoard />
          </TabsContent>

          <TabsContent value="api">
            <ApiKeyManager />
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Device Management</CardTitle>
                <CardDescription>Manage your linked devices and security settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Smartphone className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-medium">Web Browser</p>
                        <p className="text-sm text-slate-500">Last used: Just now</p>
                      </div>
                    </div>
                    <Badge variant="outline">Active</Badge>
                  </div>
                  
                  <div className="text-center py-8">
                    <p className="text-slate-500 mb-4">
                      Additional device management features coming soon
                    </p>
                    <Button variant="destructive" onClick={handleLogout}>
                      Log Out All Devices
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}