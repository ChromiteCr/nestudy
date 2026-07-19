import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlanningStore, selectTodayTasks } from '@/stores/planningStore'
import { AddTaskForm } from './AddTaskForm'
import { EventList } from './EventList'
import { TaskRow } from './TaskRow'

export function TasksView() {
  const tasks = usePlanningStore((s) => s.tasks)
  const events = usePlanningStore((s) => s.events)
  const todayTasks = selectTodayTasks(tasks)
  const eventTitle = (id?: string) => events.find((e) => e.id === id)?.title

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <header>
          <h1 className="font-heading text-xl font-semibold">任务</h1>
          <p className="text-sm text-muted-foreground">
            {todayTasks.length > 0 ? `今日待办 ${todayTasks.length} 条` : '今日无待办'}
          </p>
        </header>

        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today">今日</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="ddl">考试 / DDL</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="flex flex-col gap-3 pt-2">
            <AddTaskForm />
            <div className="flex flex-col gap-0.5">
              {todayTasks.map((t) => (
                <TaskRow key={t.id} task={t} eventTitle={eventTitle(t.parentEventId)} />
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
                <TaskRow key={t.id} task={t} eventTitle={eventTitle(t.parentEventId)} />
              ))}
              {tasks.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  还没有任务，从上方添加，或让学栖帮你规划
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ddl" className="pt-2">
            <EventList />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
