import { useState } from 'react'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePlanningStore } from '@/stores/planningStore'
import { daysUntil, isoToday } from '@/lib/db/planning'
import { cn } from '@/lib/utils'
import type { EventType } from '@/types'

const TYPE_LABEL: Record<EventType, string> = {
  exam: '考试',
  deadline: '截止',
  activity: '活动',
}

export function formatCountdown(isoDate: string): string {
  const diff = daysUntil(isoDate)
  if (diff < 0) return `已过 ${-diff} 天`
  if (diff === 0) return '就是今天'
  return `还有 ${diff} 天`
}

interface EventListProps {
  /** 点击某一行时触发（面板卡片跳转定位用） */
  onSelectEvent?: (id: string) => void
  /** 从别处跳转定位过来时短暂高亮的事件 id */
  highlightId?: string | null
}

export function EventList({ onSelectEvent, highlightId }: EventListProps = {}) {
  const events = usePlanningStore((s) => s.events)
  const tasks = usePlanningStore((s) => s.tasks)
  const removeEvent = usePlanningStore((s) => s.removeEvent)
  const createEvent = usePlanningStore((s) => s.createEvent)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(isoToday())
  const [type, setType] = useState<EventType>('exam')

  const submit = async () => {
    if (!title.trim()) return
    await createEvent({ title: title.trim(), date, type, source: 'manual' })
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit()
          }}
          placeholder="添加考试 / DDL / 活动…"
          className="h-8 min-w-40 flex-1"
        />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-36" />
        <Select value={type} onValueChange={(v) => setType(v as EventType)}>
          <SelectTrigger className="h-8 w-24" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="exam">考试</SelectItem>
            <SelectItem value="deadline">截止</SelectItem>
            <SelectItem value="activity">活动</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 gap-1" disabled={!title.trim()} onClick={() => void submit()}>
          <Plus className="size-3.5" />
          添加
        </Button>
      </div>

      <div className="flex flex-col gap-0.5">
        {events.map((e) => {
          const linkedCount = tasks.filter((t) => t.parentEventId === e.id).length
          const overdue = daysUntil(e.date) < 0
          return (
            <div
              key={e.id}
              data-event-id={e.id}
              onClick={() => onSelectEvent?.(e.id)}
              className={cn(
                'group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50',
                onSelectEvent && 'cursor-pointer',
                highlightId === e.id && 'bg-primary/10 ring-1 ring-primary/40',
              )}
            >
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {e.date}
                  {linkedCount > 0 && ` · ${linkedCount} 个关联任务`}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {TYPE_LABEL[e.type]}
              </Badge>
              <span className={cn('shrink-0 text-xs', overdue ? 'text-muted-foreground' : daysUntil(e.date) <= 7 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                {formatCountdown(e.date)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                aria-label="删除事件"
                onClick={(ev) => {
                  ev.stopPropagation()
                  void removeEvent(e.id)
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )
        })}
        {events.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            还没有考试或 DDL，从上方添加，或在对话里粘贴通知让学栖帮你导入
          </p>
        )}
      </div>
    </div>
  )
}
