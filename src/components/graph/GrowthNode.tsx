import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GraduationCap, Target } from 'lucide-react'
import { CATEGORY_COLOR } from '@/components/activities/ActivitiesView'
import { cn } from '@/lib/utils'
import type { GraphNodeType } from './graph-model'
import type { ActivityCategory } from '@/types'

export interface GrowthNodeData {
  label: string
  sublabel?: string
  nodeType: GraphNodeType
  category?: ActivityCategory
  [key: string]: unknown
}

/** 成长网络节点：活动按分类着色、课程为辅、目标校为锚点 */
export function GrowthNode({ data }: NodeProps & { data: GrowthNodeData }) {
  const { nodeType, category, label, sublabel } = data

  if (nodeType === 'school') {
    return (
      <NodeShell className="border-primary/50 bg-primary/10">
        <div className="flex items-center gap-1.5">
          <Target className="size-3.5 text-primary" />
          <span className="text-xs font-semibold">{label}</span>
        </div>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </NodeShell>
    )
  }

  if (nodeType === 'course') {
    return (
      <NodeShell className="border-dashed">
        <div className="flex items-center gap-1.5">
          <GraduationCap className="size-3.5 text-muted-foreground" />
          <span className="text-xs">{label}</span>
        </div>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </NodeShell>
    )
  }

  return (
    <NodeShell>
      <div className="flex items-center gap-1.5">
        <span className={cn('size-2 shrink-0 rounded-full', category && CATEGORY_COLOR[category])} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
    </NodeShell>
  )
}

function NodeShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex max-w-44 flex-col gap-0.5 rounded-lg border bg-card px-2.5 py-1.5 shadow-xs',
        className,
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-none !bg-muted-foreground/40" />
      {children}
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-none !bg-muted-foreground/40" />
    </div>
  )
}
