import { Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { usePlanningStore } from '@/stores/planningStore'
import { daysUntil } from '@/lib/db/planning'
import { cn } from '@/lib/utils'
import type { Task, TaskPriority } from '@/types'

const PRIORITY_LABEL: Record<TaskPriority, { text: string; className: string }> = {
  high: { text: '高', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  medium: { text: '中', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400' },
  low: { text: '低', className: 'bg-muted text-muted-foreground' },
}

export function formatDue(isoDate: string): string {
  const diff = daysUntil(isoDate)
  if (diff < 0) return `逾期 ${-diff} 天`
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  return `${diff} 天后`
}

interface TaskRowProps {
  task: Task
  /** 显示关联事件标题（可选） */
  eventTitle?: string
  /** 点击整行时触发（面板卡片用来跳转任务页并定位）；任务页内不传，行为退化为普通展示 */
  onSelect?: () => void
  /** 从别处跳转定位过来时短暂高亮 */
  highlighted?: boolean
}

export function TaskRow({ task, eventTitle, onSelect, highlighted }: TaskRowProps) {
  const toggleTask = usePlanningStore((s) => s.toggleTask)
  const removeTask = usePlanningStore((s) => s.removeTask)
  const completed = task.status === 'completed'
  const overdue = !completed && daysUntil(task.dueDate) < 0
  const priority = PRIORITY_LABEL[task.priority]

  return (
    <div
      data-task-id={task.id}
      onClick={onSelect}
      className={cn(
        'group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50',
        onSelect && 'cursor-pointer',
        highlighted && 'bg-primary/10 ring-1 ring-primary/40',
      )}
    >
      <Checkbox
        checked={completed}
        onCheckedChange={() => void toggleTask(task.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={completed ? '标记未完成' : '标记完成'}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', completed && 'text-muted-foreground line-through')}>
          {task.title}
        </p>
        {eventTitle && <p className="truncate text-xs text-muted-foreground">→ {eventTitle}</p>}
      </div>
      <Badge variant="outline" className={cn('shrink-0 text-[10px]', priority.className)}>
        {priority.text}
      </Badge>
      <span className={cn('shrink-0 text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
        {formatDue(task.dueDate)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
        aria-label="删除任务"
        onClick={(e) => {
          e.stopPropagation()
          void removeTask(task.id)
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
