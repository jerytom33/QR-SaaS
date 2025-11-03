'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  DndContext, 
  DragEndEvent, 
  DragOverEvent, 
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { 
  Plus, 
  Target, 
  DollarSign, 
  Calendar, 
  User, 
  MoreHorizontal,
  GripVertical
} from 'lucide-react'

interface Deal {
  id: string
  title: string
  value: number
  company: string
  contact: string
  stage: string
  priority: 'low' | 'medium' | 'high'
  expectedCloseDate: string
}

interface PipelineStage {
  id: string
  name: string
  deals: Deal[]
  color: string
}

const mockStages: PipelineStage[] = [
  {
    id: 'lead',
    name: 'Lead',
    color: 'bg-blue-500',
    deals: [
      {
        id: '1',
        title: 'Enterprise Software Deal',
        value: 125000,
        company: 'Tech Corp',
        contact: 'John Doe',
        stage: 'lead',
        priority: 'high',
        expectedCloseDate: '2024-03-15'
      },
      {
        id: '2',
        title: 'Marketing Automation',
        value: 45000,
        company: 'StartupXYZ',
        contact: 'Jane Smith',
        stage: 'lead',
        priority: 'medium',
        expectedCloseDate: '2024-03-20'
      }
    ]
  },
  {
    id: 'qualified',
    name: 'Qualified',
    color: 'bg-green-500',
    deals: [
      {
        id: '3',
        title: 'CRM Implementation',
        value: 85000,
        company: 'Global Solutions',
        contact: 'Mike Johnson',
        stage: 'qualified',
        priority: 'high',
        expectedCloseDate: '2024-03-10'
      }
    ]
  },
  {
    id: 'proposal',
    name: 'Proposal',
    color: 'bg-yellow-500',
    deals: [
      {
        id: '4',
        title: 'Cloud Migration',
        value: 200000,
        company: 'Enterprise Inc',
        contact: 'Sarah Williams',
        stage: 'proposal',
        priority: 'high',
        expectedCloseDate: '2024-03-08'
      }
    ]
  },
  {
    id: 'negotiation',
    name: 'Negotiation',
    color: 'bg-orange-500',
    deals: []
  },
  {
    id: 'closed-won',
    name: 'Closed Won',
    color: 'bg-purple-500',
    deals: [
      {
        id: '5',
        title: 'Security Software',
        value: 65000,
        company: 'Finance Corp',
        contact: 'David Brown',
        stage: 'closed-won',
        priority: 'medium',
        expectedCloseDate: '2024-02-28'
      }
    ]
  }
]

function DealCard({ deal }: { deal: Deal }) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'low': return 'bg-green-100 text-green-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Card className="mb-3 cursor-move hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-gray-400" />
            <h4 className="font-medium text-sm">{deal.title}</h4>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <MoreHorizontal className="w-3 h-3" />
          </Button>
        </div>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{deal.company}</span>
            <Badge className={getPriorityColor(deal.priority)} variant="secondary">
              {deal.priority}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <User className="w-3 h-3" />
              {deal.contact}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              {new Date(deal.expectedCloseDate).toLocaleDateString()}
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm font-medium text-green-600">
              ${(deal.value / 1000).toFixed(0)}K
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function StageColumn({ stage, deals }: { stage: PipelineStage; deals: Deal[] }) {
  const stageDeals = deals.filter(deal => deal.stage === stage.id)
  const totalValue = stageDeals.reduce((sum, deal) => sum + deal.value, 0)

  return (
    <Card className="flex-1 min-w-80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${stage.color}`}></div>
            <CardTitle className="text-sm">{stage.name}</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {stageDeals.length}
          </Badge>
        </div>
        {totalValue > 0 && (
          <p className="text-xs text-gray-500">
            ${(totalValue / 1000).toFixed(0)}K total
          </p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <SortableContext items={stageDeals.map(deal => deal.id)} strategy={verticalListSortingStrategy}>
          <div className="min-h-96">
            {stageDeals.map(deal => (
              <DealCard key={deal.id} deal={deal} />
            ))}
            {stageDeals.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Target className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No deals in this stage</p>
              </div>
            )}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  )
}

export default function PipelineBoard() {
  const [stages, setStages] = useState<PipelineStage[]>(mockStages)
  const [deals, setDeals] = useState<Deal[]>(mockStages.flatMap(stage => stage.deals))
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over) {
      setActiveId(null)
      return
    }

    const activeDeal = deals.find(deal => deal.id === active.id)
    if (!activeDeal) {
      setActiveId(null)
      return
    }

    // Find which stage we're dropping on
    const targetStage = stages.find(stage => 
      over.id === stage.id || stages.some(s => s.deals.some(d => d.id === over.id))
    )

    if (targetStage && targetStage.id !== activeDeal.stage) {
      // Update deal stage
      setDeals(prevDeals => 
        prevDeals.map(deal => 
          deal.id === active.id 
            ? { ...deal, stage: targetStage.id }
            : deal
        )
      )
    }

    setActiveId(null)
  }

  const activeDeal = deals.find(deal => deal.id === activeId)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Sales Pipeline</h2>
          <p className="text-gray-600">Drag and drop deals to move them between stages</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Deal
          </Button>
          <Button variant="outline" size="sm">
            <Target className="w-4 h-4 mr-2" />
            Add Stage
          </Button>
        </div>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Total Deals</p>
                <p className="text-xl font-bold">{deals.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-sm text-gray-600">Pipeline Value</p>
                <p className="text-xl font-bold">
                  ${(deals.reduce((sum, deal) => sum + deal.value, 0) / 1000).toFixed(0)}K
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-sm text-gray-600">This Month</p>
                <p className="text-xl font-bold">$320K</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-purple-500" />
              <div>
                <p className="text-sm text-gray-600">Avg Deal Size</p>
                <p className="text-xl font-bold">
                  ${deals.length > 0 ? (deals.reduce((sum, deal) => sum + deal.value, 0) / deals.length / 1000).toFixed(0) : 0}K
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map(stage => (
            <StageColumn key={stage.id} stage={stage} deals={deals} />
          ))}
        </div>
        
        <DragOverlay>
          {activeId && activeDeal ? (
            <div className="rotate-6 opacity-90">
              <DealCard deal={activeDeal} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}