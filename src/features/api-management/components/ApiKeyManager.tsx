'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { 
  Key, 
  Plus, 
  Copy, 
  Trash2, 
  Eye, 
  EyeOff, 
  Calendar,
  Activity,
  Shield
} from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  permissions: string[]
  isActive: boolean
  lastUsedAt?: string
  expiresAt?: string
  createdAt: string
  fullKey?: string
}

export default function ApiKeyManager() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

  // Mock data for demo
  useEffect(() => {
    const mockKeys: ApiKey[] = [
      {
        id: '1',
        name: 'Production API Key',
        keyPrefix: 'crm_prod_',
        permissions: ['contacts:read', 'contacts:write', 'companies:read'],
        isActive: true,
        lastUsedAt: '2024-01-20T10:30:00Z',
        createdAt: '2024-01-15T00:00:00Z'
      },
      {
        id: '2',
        name: 'Development Key',
        keyPrefix: 'crm_dev_',
        permissions: ['contacts:read', 'companies:read'],
        isActive: true,
        lastUsedAt: '2024-01-19T15:45:00Z',
        createdAt: '2024-01-10T00:00:00Z'
      },
      {
        id: '3',
        name: 'Integration Key',
        keyPrefix: 'crm_int_',
        permissions: ['contacts:read', 'contacts:write', 'companies:read', 'companies:write'],
        isActive: false,
        lastUsedAt: '2024-01-18T09:20:00Z',
        expiresAt: '2024-06-15T00:00:00Z',
        createdAt: '2024-01-05T00:00:00Z'
      }
    ]

    setTimeout(() => {
      setApiKeys(mockKeys)
      setLoading(false)
    }, 1000)
  }, [])

  const createApiKey = async () => {
    if (!newKeyName.trim()) return

    setCreatingKey(true)
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const newKey: ApiKey = {
        id: Date.now().toString(),
        name: newKeyName,
        keyPrefix: 'crm_new_',
        permissions: ['contacts:read', 'contacts:write', 'companies:read'],
        isActive: true,
        createdAt: new Date().toISOString(),
        fullKey: `crm_new_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
      }

      setApiKeys(prev => [newKey, ...prev])
      setNewlyCreatedKey(newKey.fullKey || '')
      setNewKeyName('')
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Failed to create API key:', error)
    } finally {
      setCreatingKey(false)
    }
  }

  const revokeKey = async (keyId: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setApiKeys(prev => 
        prev.map(key => 
          key.id === keyId 
            ? { ...key, isActive: false }
            : key
        )
      )
    } catch (error) {
      console.error('Failed to revoke API key:', error)
    }
  }

  const deleteKey = async (keyId: string) => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      
      setApiKeys(prev => prev.filter(key => key.id !== keyId))
    } catch (error) {
      console.error('Failed to delete API key:', error)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const newSet = new Set(prev)
      if (newSet.has(keyId)) {
        newSet.delete(keyId)
      } else {
        newSet.add(keyId)
      }
      return newSet
    })
  }

  const getPermissionColor = (permission: string) => {
    if (permission.includes('write')) return 'bg-orange-100 text-orange-800'
    if (permission.includes('read')) return 'bg-blue-100 text-blue-800'
    return 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-4 border rounded-lg">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Keys</h2>
          <p className="text-gray-600">Manage your API keys for external integrations</p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Generate a new API key for external integrations
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Key Name</label>
                <Input
                  placeholder="e.g., Production API Key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={createApiKey}
                  disabled={!newKeyName.trim() || creatingKey}
                >
                  {creatingKey ? 'Creating...' : 'Create Key'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* New Key Alert */}
      {newlyCreatedKey && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-green-900">API Key Created!</h4>
                <p className="text-sm text-green-700 mb-3">
                  Save this key securely. You won't be able to see it again.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={newlyCreatedKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(newlyCreatedKey)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewlyCreatedKey(null)}
              >
                ×
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* API Keys List */}
      <div className="space-y-4">
        {apiKeys.map((key) => (
          <Card key={key.id} className={!key.isActive ? 'opacity-60' : ''}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium">{key.name}</h3>
                    <Badge variant={key.isActive ? 'default' : 'secondary'}>
                      {key.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-gray-400" />
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {key.keyPrefix}{'*'.repeat(20)}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleKeyVisibility(key.id)}
                      >
                        {visibleKeys.has(key.id) ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      {visibleKeys.has(key.id) && key.fullKey && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(key.fullKey!)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Created {new Date(key.createdAt).toLocaleDateString()}
                      </div>
                      {key.lastUsedAt && (
                        <div className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                        </div>
                      )}
                      {key.expiresAt && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Expires {new Date(key.expiresAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {key.permissions.map((permission, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className={getPermissionColor(permission)}
                        >
                          {permission}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  {key.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeKey(key.id)}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revokeKey(key.id)}
                    >
                      Reactivate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteKey(key.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {apiKeys.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Key className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No API Keys</h3>
            <p className="text-gray-500 mb-4">
              Create your first API key to start integrating with external systems
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create API Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* API Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>API Documentation</CardTitle>
          <CardDescription>
            Use these endpoints to integrate with your CRM data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Authentication</h4>
              <code className="block bg-gray-100 p-3 rounded text-sm">
                curl -X GET "http://localhost:3000/api/v1/connection/contacts" \<br/>
                &nbsp;&nbsp;-H "x-api-key: YOUR_API_KEY"
              </code>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Available Endpoints</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li><code>GET /api/v1/connection/contacts</code> - List contacts</li>
                <li><code>POST /api/v1/connection/contacts</code> - Create contact</li>
                <li><code>PUT /api/v1/connection/contacts</code> - Update contact</li>
                <li><code>DELETE /api/v1/connection/contacts</code> - Delete contact</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}