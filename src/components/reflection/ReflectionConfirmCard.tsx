import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { ReflectionProposedEdge } from '@/types'

interface ReflectionConfirmCardProps {
  summary: string
  edges: ReflectionProposedEdge[]
  onConfirm: (summary: string, edges: ReflectionProposedEdge[]) => void
  onCancel: () => void
}

/** 采访结束后的确认卡：可编辑总结文字、勾选/取消每条 AI 建议的叙事线连接 */
export function ReflectionConfirmCard({ summary, edges, onConfirm, onCancel }: ReflectionConfirmCardProps) {
  const [draft, setDraft] = useState(summary)
  const [edgeState, setEdgeState] = useState(edges)

  const toggle = (i: number, include: boolean) =>
    setEdgeState((prev) => prev.map((e, idx) => (idx === i ? { ...e, include } : e)))

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div>
        <p className="mb-1 text-sm font-medium">反思总结</p>
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-24 text-sm" />
      </div>

      {edgeState.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">AI 建议的连接</p>
          <div className="flex flex-col gap-1.5">
            {edgeState.map((e, i) => {
              const unresolved = !e.targetNodeId
              return (
                <div key={i} className="flex items-start gap-2">
                  <Checkbox
                    className="mt-0.5"
                    checked={e.include && !unresolved}
                    disabled={unresolved}
                    onCheckedChange={(v) => toggle(i, v === true)}
                  />
                  <div className={cn('min-w-0 flex-1', (!e.include || unresolved) && 'opacity-50')}>
                    <p className="text-sm">
                      <span className="font-medium">{e.targetLabel}</span>
                      {unresolved && <span className="ml-1 text-xs text-destructive">（未匹配到节点，无法连接）</span>}
                    </p>
                    {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => onConfirm(draft.trim(), edgeState)}>
          <Check className="size-3.5" />
          确认保存
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onCancel}>
          <X className="size-3.5" />
          取消
        </Button>
      </div>
    </div>
  )
}
