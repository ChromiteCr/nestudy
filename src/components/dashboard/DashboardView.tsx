import {
  ArrowRight,
  CalendarClock,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore, selectTodayTasks } from '@/stores/planningStore'
import { daysUntil } from '@/lib/db/planning'
import { TaskRow } from '@/components/tasks/TaskRow'
import { formatCountdown } from '@/components/tasks/EventList'
import { cn } from '@/lib/utils'
import type { AppView } from '@/types'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

interface DashboardViewProps {
  onNavigate: (view: AppView) => void
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const conversations = useChatStore((s) => s.conversations)
  const tasks = usePlanningStore((s) => s.tasks)
  const events = usePlanningStore((s) => s.events)
  const todayTasks = selectTodayTasks(tasks)
  const upcomingEvents = events.filter((e) => daysUntil(e.date) >= 0).slice(0, 4)
  const today = new Date().toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{today}</p>
          <h1 className="font-heading text-2xl font-semibold">{greeting()}</h1>
        </header>

        {/* 对话入口 */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4 text-primary" />
                和学栖聊聊
              </CardTitle>
              <CardDescription>
                {conversations.length > 0
                  ? `${conversations.length} 个会话 · 规划、提问、安排，随时开口`
                  : '从一句话开始：说说你现在最想解决的事'}
              </CardDescription>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => onNavigate('chat')}>
              进入对话
              <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 今日任务（真实数据） */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ListTodo className="size-4" />
                  今日任务
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate('tasks')}>
                  全部
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5">
              {todayTasks.slice(0, 5).map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
              {todayTasks.length > 5 && (
                <p className="px-2 pt-1 text-xs text-muted-foreground">
                  还有 {todayTasks.length - 5} 条，去任务页查看
                </p>
              )}
              {todayTasks.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">今天没有待办 🎉</p>
              )}
            </CardContent>
          </Card>

          {/* 近期 DDL（真实数据） */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <CalendarClock className="size-4" />
                  近期 DDL
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate('tasks')}>
                  管理
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {upcomingEvents.map((e) => {
                const urgent = daysUntil(e.date) <= 7
                return (
                  <div key={e.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                    <span className={cn('shrink-0 text-xs', urgent ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                      {formatCountdown(e.date)}
                    </span>
                  </div>
                )
              })}
              {upcomingEvents.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  暂无即将到来的考试或截止日期
                </p>
              )}
            </CardContent>
          </Card>

          {/* 占位：S3/S4 */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Network className="size-4" />
                  成果网络
                </span>
                <Badge variant="secondary" className="text-[10px]">S3 推出</Badge>
              </CardTitle>
              <CardDescription>活动、课程与成果串成叙事网络</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <NotebookPen className="size-4" />
                  反思
                </span>
                <Badge variant="secondary" className="text-[10px]">S4 推出</Badge>
              </CardTitle>
              <CardDescription>活动结束后的 AI 采访式反思记录</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          数据 100% 存于本地浏览器 · 学栖 StudyNest
        </p>
      </div>
    </div>
  )
}
