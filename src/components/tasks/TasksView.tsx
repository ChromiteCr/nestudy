import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlanningStore, selectTodayTasks } from '@/stores/planningStore'
import { useTaskUiStore } from '@/stores/taskUiStore'
import { AddTaskForm } from './AddTaskForm'
import { EventList } from './EventList'
import { TaskRow } from './TaskRow'

export function TasksView() {
  const tasks = usePlanningStore((s) => s.tasks)
  const events = usePlanningStore((s) => s.events)
  const todayTasks = selectTodayTasks(tasks)
  const eventTitle = (id?: string) => events.find((e) => e.id === id)?.title

  // 从面板跳转过来时预置 tab；只在挂载时读一次，随后清空信号避免下次挂载复用
  const [tab, setTab] = useState(() => useTaskUiStore.getState().pendingTab ?? 'today')
  const [highlightId, setHighlightId] = useState<string | null>(null)

  useEffect(() => {
    const store = useTaskUiStore.getState()
    const focusId = store.pendingFocusId
    store.setPendingTab(null)
    store.setPendingFocusId(null)
    if (!focusId) return
    setHighlightId(focusId)
    const el = document.querySelector(`[data-task-id="${focusId}"], [data-event-id="${focusId}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(() => setHighlightId(null), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <header>
          <h1 className="font-heading text-xl font-semibold">任务</h1>
          <p className="text-sm text-muted-foreground">
            {todayTasks.length > 0 ? `今日待办 ${todayTasks.length} 条` : '今日无待办'}
          </p>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'today' | 'all' | 'ddl')}>
          <TabsList>
            <TabsTrigger value="today">今日</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="ddl">考试 / DDL</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="flex flex-col gap-3 pt-2">
            <AddTaskForm />
            <div className="flex flex-col gap-0.5">
              {todayTasks.map((t) => (
                <TaskRow key={t.id} task={t} eventTitle={eventTitle(t.parentEventId)} highlighted={highlightId === t.id} />
              ))}
              {todayTasks.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  今天没有待办任务 🎉
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="all" className="flex flex-col gap-3 pt-2">
            <AddTaskForm />
            <div className="flex flex-col gap-0.5">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} eventTitle={eventTitle(t.parentEventId)} highlighted={highlightId === t.id} />
              ))}
              {tasks.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  还没有任务，从上方添加，或让学栖帮你规划
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ddl" className="pt-2">
            <EventList highlightId={highlightId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
