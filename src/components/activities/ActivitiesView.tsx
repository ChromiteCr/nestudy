import { useState } from 'react'
import { NotebookPen, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { useChatStore } from '@/stores/chatStore'
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_CATEGORY_LABEL,
  ACTIVITY_LEVEL_LABEL,
  type Activity,
  type ActivityCategory,
  type AppView,
} from '@/types'
import { ActivityForm, activityToDraft, emptyDraft, type ActivityDraft } from './ActivityForm'

/** 分类色（与网络图节点着色共用一套语义色） */
export const CATEGORY_COLOR: Record<ActivityCategory, string> = {
  academic: 'bg-blue-500',
  leadership: 'bg-amber-500',
  service: 'bg-emerald-500',
  athletics: 'bg-orange-500',
  arts: 'bg-pink-500',
  work: 'bg-cyan-500',
  research: 'bg-violet-500',
  other: 'bg-slate-500',
}

const DESCRIBE_PROMPT =
  '我想把我参加过的课外活动记录进档案。请像采访一样一步步问我：活动名称、我的角色、时间、做了什么、有什么成果和获奖，每次问一个方面，然后用 propose_activities 汇总成提案。'

interface ActivitiesViewProps {
  onNavigate: (view: AppView) => void
}

export function ActivitiesView({ onNavigate }: ActivitiesViewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const createActivity = usePlanningStore((s) => s.createActivity)
  const editActivity = usePlanningStore((s) => s.editActivity)
  const removeActivity = usePlanningStore((s) => s.removeActivity)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<ActivityDraft>(emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)

  const startAdd = () => {
    setDraft(emptyDraft())
    setEditingId(null)
    setAdding(true)
  }

  const submitAdd = async () => {
    await createActivity({ ...draft, source: 'manual' })
    setAdding(false)
    setDraft(emptyDraft())
  }

  const submitEdit = async () => {
    if (editingId) await editActivity(editingId, draft)
    setEditingId(null)
  }

  const describeViaChat = () => {
    setPendingPrompt(DESCRIBE_PROMPT)
    onNavigate('chat')
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold">活动档案</h1>
            <p className="text-sm text-muted-foreground">
              {activities.length > 0 ? `${activities.length} 个活动` : '记录你的课外活动、竞赛、科研与成果'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={describeViaChat}>
              <Sparkles className="size-3.5" />
              对话添加
            </Button>
            <Button size="sm" className="gap-1.5" onClick={startAdd}>
              <Plus className="size-3.5" />
              新增
            </Button>
          </div>
        </header>

        {adding && (
          <ActivityForm
            draft={draft}
            onChange={setDraft}
            onSubmit={() => void submitAdd()}
            onCancel={() => setAdding(false)}
            submitLabel="添加活动"
          />
        )}

        <div className="flex flex-col gap-2">
          {activities.map((a) =>
            editingId === a.id ? (
              <ActivityForm
                key={a.id}
                draft={draft}
                onChange={setDraft}
                onSubmit={() => void submitEdit()}
                onCancel={() => setEditingId(null)}
                submitLabel="保存修改"
              />
            ) : (
              <ActivityRow
                key={a.id}
                activity={a}
                onEdit={() => {
                  setDraft(activityToDraft(a))
                  setAdding(false)
                  setEditingId(a.id)
                }}
                onDelete={() => void removeActivity(a.id)}
                onReflect={() => {
                  useReflectionUiStore.getState().setPendingActivityId(a.id)
                  onNavigate('reflection')
                }}
              />
            ),
          )}
          {activities.length === 0 && !adding && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              还没有活动。点「新增」手动添加，或「对话添加」让学栖采访你。
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityRow({
  activity,
  onEdit,
  onDelete,
  onReflect,
}: {
  activity: Activity
  onEdit: () => void
  onDelete: () => void
  onReflect: () => void
}) {
  return (
    <div className="group flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30">
      <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', CATEGORY_COLOR[activity.category])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{activity.title}</span>
          <Badge variant="outline" className="text-[10px]">
            {ACTIVITY_CATEGORY_LABEL[activity.category]}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {ACTIVITY_LEVEL_LABEL[activity.level]}
          </Badge>
          {!activity.endDate && <Badge className="bg-emerald-500/10 text-emerald-600 text-[10px] dark:text-emerald-400" variant="outline">进行中</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {[activity.role, activity.organization].filter(Boolean).join(' · ')}
          {activity.startDate && ` · ${activity.startDate}${activity.endDate ? ` ~ ${activity.endDate}` : ''}`}
        </p>
        {activity.description && <p className="mt-1 text-sm">{activity.description}</p>}
        {activity.achievements.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">🏅 {activity.achievements.join('、')}</p>
        )}
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="size-7" aria-label="反思一下" onClick={onReflect}>
          <NotebookPen className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="编辑活动" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" aria-label="删除活动" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
