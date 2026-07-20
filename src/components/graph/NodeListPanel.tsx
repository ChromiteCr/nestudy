import { X } from 'lucide-react'
import type { NarrativeEdge } from '@/types'
import type { SphereNode } from './sphere-model'

interface NodeListPanelProps {
  nodes: SphereNode[]
  narrativeEdges: NarrativeEdge[]
  onSelect: (id: string) => void
  onClose: () => void
}

/**
 * 全部事项列表：绕开 3D 遮挡直接定位任意节点。
 * 分组为专业方向 / 已连接叙事线 / 尚未连接——后两组能提示哪些活动还没被叙事线串起来。
 */
export function NodeListPanel({ nodes, narrativeEdges, onSelect, onClose }: NodeListPanelProps) {
  const majors = nodes.filter((n) => n.kind === 'major')
  const others = nodes.filter((n) => n.kind !== 'major')
  const hasEdge = (id: string) => narrativeEdges.some((e) => e.sourceNodeId === id || e.targetNodeId === id)
  const connected = others.filter((n) => hasEdge(n.id))
  const unconnected = others.filter((n) => !hasEdge(n.id))

  return (
    <div className="flex max-h-[60dvh] w-64 flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-border">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">全部事项（{nodes.length}）</span>
        <button type="button" aria-label="关闭" className="text-muted-foreground" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto">
        <Group title="专业方向" items={majors} onSelect={onSelect} />
        <Group title={`已连接叙事线 · ${connected.length}`} items={connected} onSelect={onSelect} />
        <Group title={`尚未连接 · ${unconnected.length}`} items={unconnected} onSelect={onSelect} />
      </div>
    </div>
  )
}

function Group({ title, items, onSelect }: { title: string; items: SphereNode[]; onSelect: (id: string) => void }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-1 text-[10px] font-medium text-muted-foreground">{title}</span>
      {items.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onSelect(n.id)}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted"
        >
          <span className="size-2 shrink-0 rounded-full" style={{ background: n.color }} />
          <span className="min-w-0 truncate">{n.label}</span>
        </button>
      ))}
    </div>
  )
}
