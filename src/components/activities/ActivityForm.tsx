import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ACTIVITY_CATEGORY_LABEL,
  ACTIVITY_LEVEL_LABEL,
  type Activity,
  type ActivityCategory,
  type ActivityLevel,
} from '@/types'

export interface ActivityDraft {
  title: string
  category: ActivityCategory
  role: string
  organization: string
  startDate: string
  endDate: string | null
  description: string
  achievements: string[]
  level: ActivityLevel
}

export function emptyDraft(): ActivityDraft {
  return {
    title: '',
    category: 'academic',
    role: '',
    organization: '',
    startDate: '',
    endDate: null,
    description: '',
    achievements: [],
    level: 'school',
  }
}

export function activityToDraft(a: Activity): ActivityDraft {
  const { id: _id, createdAt: _c, source: _s, ...rest } = a
  return rest
}

interface ActivityFormProps {
  draft: ActivityDraft
  onChange: (draft: ActivityDraft) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
}

/** 活动新增/编辑表单（内联展开，任务/事件表单同风格） */
export function ActivityForm({ draft, onChange, onSubmit, onCancel, submitLabel }: ActivityFormProps) {
  const [achievementInput, setAchievementInput] = useState('')
  const patch = (p: Partial<ActivityDraft>) => onChange({ ...draft, ...p })

  const addAchievement = () => {
    const v = achievementInput.trim()
    if (!v) return
    patch({ achievements: [...draft.achievements, v] })
    setAchievementInput('')
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap gap-2">
        <Input
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="活动名称"
          className="h-8 min-w-40 flex-1"
        />
        <Select value={draft.category} onValueChange={(v) => patch({ category: v as ActivityCategory })}>
          <SelectTrigger className="h-8 w-28" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ACTIVITY_CATEGORY_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draft.level} onValueChange={(v) => patch({ level: v as ActivityLevel })}>
          <SelectTrigger className="h-8 w-24" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ACTIVITY_LEVEL_LABEL).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input value={draft.role} onChange={(e) => patch({ role: e.target.value })} placeholder="角色（如队长）" className="h-8 min-w-32 flex-1" />
        <Input value={draft.organization} onChange={(e) => patch({ organization: e.target.value })} placeholder="组织/机构" className="h-8 min-w-32 flex-1" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">起</span>
        <Input type="date" value={draft.startDate} onChange={(e) => patch({ startDate: e.target.value })} className="h-8 w-36" />
        <span className="text-muted-foreground">止</span>
        <Input
          type="date"
          value={draft.endDate ?? ''}
          onChange={(e) => patch({ endDate: e.target.value || null })}
          className="h-8 w-36"
        />
        <span className="text-xs text-muted-foreground">留空 = 进行中</span>
      </div>

      <Textarea
        value={draft.description}
        onChange={(e) => patch({ description: e.target.value })}
        placeholder="一句话描述做了什么"
        className="min-h-16"
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <Input
            value={achievementInput}
            onChange={(e) => setAchievementInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                addAchievement()
              }
            }}
            placeholder="添加成果/奖项，回车确认"
            className="h-8 flex-1"
          />
          <Button size="sm" variant="outline" className="h-8" onClick={addAchievement}>
            <Plus className="size-3.5" />
          </Button>
        </div>
        {draft.achievements.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.achievements.map((a, i) => (
              <span key={i} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {a}
                <button
                  type="button"
                  aria-label="移除成果"
                  onClick={() => patch({ achievements: draft.achievements.filter((_, idx) => idx !== i) })}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={!draft.title.trim()} onClick={onSubmit}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
