import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, NotebookPen, Pencil, Sparkles, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlanningStore } from '@/stores/planningStore'
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { regenerateEdgeReason, regenerateNodeBlurb } from '@/lib/ai/graph-ai'
import { effectiveMajors } from './sphere-model'
import type { AppView, NarrativeEdge } from '@/types'
import type { ProjectedNode } from './sphere-model'

const SHELL_CHIPS: { shell: number; label: string }[] = [
  { shell: 1, label: '核心' },
  { shell: 2, label: '次要' },
  { shell: 3, label: '外围' },
]

/**
 * 星点卡片：圆形点击后变形为圆角卡，展示名称+详情，支持手动编辑 / AI 重新生成。
 * 反思卫星节点走独立分支（编辑摘要 + 删除 + 跳转查看完整问答），但所有 Hooks
 * 必须无条件调用——之前把 useState 放在分支 return 之后，切换反思/其他节点类型时
 * 两次渲染的 Hook 数量不一致，触发 React "Rendered fewer hooks than expected" 崩溃。
 */
export function NodeCard({
  node,
  onClose,
  onNavigate,
}: {
  node: ProjectedNode
  onClose: () => void
  onNavigate: (view: AppView) => void
}) {
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)
  const reflections = usePlanningStore((s) => s.reflections)
  const graphMeta = usePlanningStore((s) => s.graphMeta)
  const setNodeMeta = usePlanningStore((s) => s.setNodeMeta)
  const updateProfile = usePlanningStore((s) => s.updateProfile)
  const editReflection = usePlanningStore((s) => s.editReflection)
  const removeReflection = usePlanningStore((s) => s.removeReflection)
  const setPendingOpenId = useReflectionUiStore((s) => s.setPendingOpenId)

  const isReflection = node.kind === 'reflection'
  const reflection = isReflection ? reflections.find((r) => `reflection:${r.id}` === node.id) : undefined
  const meta = graphMeta[node.id]
  const derived = isReflection ? (reflection?.summary ?? '') : derivedDetail(node, activities, profile)
  const detail = isReflection ? derived : (meta?.blurb ?? derived)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(detail)
  const [busy, setBusy] = useState(false)

  const majors = effectiveMajors(profile)

  const save = async () => {
    if (isReflection) {
      if (reflection) await editReflection(reflection.id, { summary: draft.trim() })
    } else {
      await setNodeMeta(node.id, { blurb: draft.trim() })
    }
    setEditing(false)
  }

  const regenerate = async () => {
    setBusy(true)
    try {
      const blurb = await regenerateNodeBlurb(node.label, node.kind, majors)
      await setNodeMeta(node.id, { blurb })
      setDraft(blurb)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  const removeMajor = async () => {
    const idx = Number(node.id.split(':')[1])
    const list = effectiveMajors(profile).filter((_, i) => i !== idx)
    await updateProfile({ majorDirections: list })
    onClose()
  }

  const viewFullReflection = () => {
    if (reflection) setPendingOpenId(reflection.id)
    onNavigate('reflection')
  }

  const removeReflectionNode = async () => {
    if (reflection) await removeReflection(reflection.id)
    onClose()
  }

  return (
    <CardFrame onClose={onClose}>
      <div className="flex items-center gap-1.5">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: node.color }} />
        <span className="font-medium">{node.label}</span>
      </div>

      {editing ? (
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-14 text-xs" autoFocus />
      ) : (
        <p className="text-xs text-muted-foreground">
          {detail || (isReflection ? '（反思内容缺失）' : '（暂无详情，试试 AI 生成或手动编辑）')}
        </p>
      )}

      {/* 分层快捷设置（非专业方向、非反思卫星节点——反思坐标由父活动决定，不走分层系统） */}
      {node.kind !== 'major' && !isReflection && (
        <div className="flex items-center gap-1">
          {SHELL_CHIPS.map((c) => (
            <button
              key={c.shell}
              type="button"
              onClick={() => void setNodeMeta(node.id, { shell: c.shell, pinned: true })}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                node.shell === c.shell ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <CardActions
        busy={busy}
        editing={editing}
        hideRegenerate={isReflection}
        onRegenerate={() => void regenerate()}
        onEdit={() => {
          setDraft(detail)
          setEditing(true)
        }}
        onSave={() => void save()}
        extra={
          node.kind === 'major' ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={() => void removeMajor()}>
              <Trash2 className="size-3" />
              移除
            </Button>
          ) : isReflection ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={viewFullReflection}>
                <NotebookPen className="size-3" />
                查看完整
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-destructive"
                onClick={() => void removeReflectionNode()}
              >
                <Trash2 className="size-3" />
                删除
              </Button>
            </>
          ) : undefined
        }
      />
    </CardFrame>
  )
}

/** 叙事线卡片：点击边后展示连接说明，支持手动编辑 / AI 重新生成 / 删除 */
export function EdgeCard({
  edge,
  endpoints,
  onClose,
}: {
  edge: NarrativeEdge
  endpoints: { source: string; target: string }
  onClose: () => void
}) {
  const profile = usePlanningStore((s) => s.profile)
  const editEdge = usePlanningStore((s) => s.editEdge)
  const removeEdge = usePlanningStore((s) => s.removeEdge)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(edge.label)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    await editEdge(edge.id, { label: draft.trim() })
    setEditing(false)
  }
  const regenerate = async () => {
    setBusy(true)
    try {
      const reason = await regenerateEdgeReason(endpoints.source, endpoints.target, effectiveMajors(profile))
      await editEdge(edge.id, { label: reason })
      setDraft(reason)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardFrame onClose={onClose}>
      <p className="text-sm font-medium">
        {endpoints.source} <span className="text-muted-foreground">↔</span> {endpoints.target}
      </p>
      {editing ? (
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-14 text-xs" autoFocus />
      ) : (
        <p className="text-xs text-muted-foreground">{edge.label || '（暂无说明）'}</p>
      )}
      <CardActions
        busy={busy}
        editing={editing}
        onRegenerate={() => void regenerate()}
        onEdit={() => {
          setDraft(edge.label)
          setEditing(true)
        }}
        onSave={() => void save()}
        extra={
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive" onClick={() => void removeEdge(edge.id)}>
            <Trash2 className="size-3" />
            删除
          </Button>
        }
      />
    </CardFrame>
  )
}

/** 悬浮长方形卡片的通用外壳：进入渐显，点击关闭时先渐隐再真正卸载 */
function CardFrame({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    setTimeout(onClose, 140)
  }

  return (
    <div
      className={`flex w-60 flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-border ${
        closing ? 'animate-[card-fade-out_140ms_ease-in]' : 'animate-[card-fade-in_150ms_ease-out]'
      }`}
    >
      <button type="button" aria-label="关闭" className="absolute right-2 top-2 text-muted-foreground" onClick={handleClose}>
        <X className="size-3.5" />
      </button>
      {children}
    </div>
  )
}

function CardActions({
  busy,
  editing,
  hideRegenerate,
  onRegenerate,
  onEdit,
  onSave,
  extra,
}: {
  busy: boolean
  editing: boolean
  hideRegenerate?: boolean
  onRegenerate: () => void
  onEdit: () => void
  onSave: () => void
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1 border-t pt-2">
      <Sparkles className="size-3.5 text-primary" />
      {editing ? (
        <Button size="sm" className="h-7 text-xs" onClick={onSave}>
          保存
        </Button>
      ) : (
        <>
          {!hideRegenerate && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" disabled={busy} onClick={onRegenerate}>
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              重新生成
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onEdit}>
            <Pencil className="size-3" />
            手动编辑
          </Button>
        </>
      )}
      {extra}
    </div>
  )
}

function derivedDetail(
  node: ProjectedNode,
  activities: ReturnType<typeof usePlanningStore.getState>['activities'],
  profile: ReturnType<typeof usePlanningStore.getState>['profile'],
): string {
  if (node.kind === 'major') return '你申请的专业方向'
  if (node.kind === 'activity') {
    const a = activities.find((x) => `activity:${x.id}` === node.id)
    if (!a) return ''
    return a.description || a.achievements.join('、') || [a.role, a.organization].filter(Boolean).join(' · ')
  }
  const c = profile?.courses.find((x) => `course:${x.id}` === node.id)
  return c?.level ? `课程 · ${c.level}` : '课程'
}
