import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Mono } from '@/components/ui/mono'
import { cn } from '@/lib/utils'
import type { CanvasNodeData } from './canvas-model'

const TONE_BAR: Record<CanvasNodeData['tone'], string> = {
  c1: 'bg-canvas-1',
  c2: 'bg-canvas-2',
  c3: 'bg-canvas-3',
  c4: 'bg-canvas-4',
  c5: 'bg-canvas-5',
  c6: 'bg-canvas-6',
  anchor: 'bg-foreground',
  quiet: 'bg-muted-foreground/40',
}

/** 画板节点：一张安静的卡片，颜色只出现在左侧那一条——学生的数据是画板上唯一有彩的东西 */
export function CanvasNodeCard({ data, selected }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div
      className={cn(
        'flex w-56 overflow-hidden rounded-sm border bg-card shadow-xs transition-shadow',
        selected ? 'ring-2 ring-signature' : 'hover:shadow-sm',
      )}
    >
      <div className={cn('w-[3px] shrink-0', TONE_BAR[data.tone])} />
      <div className="min-w-0 flex-1 px-3 py-2">
        <p className="truncate text-sm leading-snug">{data.label}</p>
        {data.meta && (
          <Mono className="mt-0.5 block truncate text-muted-foreground">{data.meta}</Mono>
        )}
        {data.blurb && (
          <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{data.blurb}</p>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-muted-foreground/50" />
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-muted-foreground/50" />
    </div>
  )
}
