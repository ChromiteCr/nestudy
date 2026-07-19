import { useState } from 'react'
import { Plus } from 'lucide-react'
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
import { isoToday } from '@/lib/db/planning'
import type { TaskPriority } from '@/types'

export function AddTaskForm() {
  const createTask = usePlanningStore((s) => s.createTask)
  const events = usePlanningStore((s) => s.events)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(isoToday())
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [parentEventId, setParentEventId] = useState<string>('none')

  const submit = async () => {
    if (!title.trim()) return
    await createTask({
      title: title.trim(),
      dueDate,
      priority,
      parentEventId: parentEventId === 'none' ? undefined : parentEventId,
      source: 'manual',
    })
    setTitle('')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit()
        }}
        placeholder="添加任务…"
        className="h-8 min-w-40 flex-1"
      />
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        className="h-8 w-36"
      />
      <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
        <SelectTrigger className="h-8 w-20" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="high">高</SelectItem>
          <SelectItem value="medium">中</SelectItem>
          <SelectItem value="low">低</SelectItem>
        </SelectContent>
      </Select>
      {events.length > 0 && (
        <Select value={parentEventId} onValueChange={setParentEventId}>
          <SelectTrigger className="h-8 w-40" size="sm">
            <SelectValue placeholder="关联事件" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不关联</SelectItem>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button size="sm" className="h-8 gap-1" disabled={!title.trim()} onClick={() => void submit()}>
        <Plus className="size-3.5" />
        添加
      </Button>
    </div>
  )
}
