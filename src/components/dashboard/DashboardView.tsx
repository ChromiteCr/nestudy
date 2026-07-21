import {
  ArrowRight,
  BellRing,
  CalendarClock,
  GraduationCap,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
  Pencil,
  Sparkles,
  X,
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
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { useReminderStore } from '@/stores/reminderStore'
import { useSkillStore } from '@/stores/skillStore'
import { getSkill } from '@/lib/skills/registry'
import { useTaskUiStore } from '@/stores/taskUiStore'
import { daysUntil } from '@/lib/db/planning'
import { TaskRow } from '@/components/tasks/TaskRow'
import { formatCountdown } from '@/components/tasks/EventList'
import type { SettingsCategory } from '@/components/settings/SettingsDialog'
import { cn } from '@/lib/utils'
import { isProfileEmpty, type AppView } from '@/types'
import type { Reminder } from '@/lib/engine/rules'

const ONBOARDING_PROMPT = '我想建立我的学生档案，请像采访一样一步步引导我：年级、课程体系、在读课程和目标分数、目标学校和专业。每次只问一个问题。'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

interface DashboardViewProps {
  onNavigate: (view: AppView) => void
  onOpenSettings: (category: SettingsCategory) => void
}

export function DashboardView({ onNavigate, onOpenSettings }: DashboardViewProps) {
  const conversations = useChatStore((s) => s.conversations)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const tasks = usePlanningStore((s) => s.tasks)
  const events = usePlanningStore((s) => s.events)
  const activities = usePlanningStore((s) => s.activities)
  const reflections = usePlanningStore((s) => s.reflections)
  const profile = usePlanningStore((s) => s.profile)
  const todayTasks = selectTodayTasks(tasks)

  const startOnboarding = () => {
    setPendingPrompt(ONBOARDING_PROMPT)
    onNavigate('chat')
  }

  const reminders = useReminderStore((s) => s.reminders)
  const dismissReminder = useReminderStore((s) => s.dismiss)
  const handleReminder = (r: Reminder) => {
    void dismissReminder(r.key)
    if (r.reflectActivityId) {
      useReflectionUiStore.getState().setPendingActivityId(r.reflectActivityId)
      onNavigate('reflection')
    } else if (r.suggestSkillId) {
      useSkillStore.getState().setActiveSkill(r.suggestSkillId)
      const skill = getSkill(r.suggestSkillId)
      setPendingPrompt(`帮我用「${skill?.name ?? '这个 skill'}」分析一下`)
      onNavigate('chat')
    } else if (r.prompt) {
      setPendingPrompt(r.prompt)
      onNavigate('chat')
    }
  }
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
          <h1 className="font-heading text-2xl font-semibold">
            {greeting()}
            {profile?.name ? `，${profile.name}` : ''}
          </h1>
          {profile?.name && (profile.grade || profile.curriculum) && (
            <p className="text-sm text-muted-foreground">
              {[profile.grade && `${profile.grade} 年级`, profile.curriculum].filter(Boolean).join(' · ')}
              {profile.targetSchools.length > 0 && ` · 目标 ${profile.targetSchools[0].name}`}
            </p>
          )}
        </header>

        {/* 主动提醒卡（规则引擎命中项） */}
        {reminders.map((r) => (
          <div
            key={r.key}
            className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3"
          >
            <BellRing className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-sm text-muted-foreground">{r.body}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => handleReminder(r)}>
                去处理
                <ArrowRight className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label="关闭提醒"
                onClick={() => void dismissReminder(r.key)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {/* 档案：空态引导建档 / 摘要 */}
        {profile && isProfileEmpty(profile) ? (
          <Card className="border-dashed border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  建立你的档案
                </CardTitle>
                <CardDescription>
                  告诉学栖你的年级、课程和目标，之后的规划建议都会围绕它展开
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={startOnboarding}>
                  对话建档
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenSettings('profile')}>
                  手动填写
                </Button>
              </div>
            </CardHeader>
          </Card>
        ) : (
          profile && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <GraduationCap className="size-4" />
                  我的档案
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => onOpenSettings('profile')}
                >
                  <Pencil className="size-3" />
                  编辑
                </Button>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                {profile.name && <Badge variant="secondary">{profile.name}</Badge>}
                {profile.grade && <Badge variant="secondary">{profile.grade} 年级</Badge>}
                {profile.curriculum && <Badge variant="secondary">{profile.curriculum}</Badge>}
                {profile.courses.length > 0 && (
                  <Badge variant="secondary">{profile.courses.length} 门课程</Badge>
                )}
                {profile.targetSchools.length > 0 && (
                  <Badge variant="secondary">
                    目标：{profile.targetSchools.map((s) => s.name).slice(0, 3).join(' / ')}
                  </Badge>
                )}
              </CardContent>
            </Card>
          )
        )}

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

        {/* 竖屏（高>宽）时始终单列纵向 */}
        <div className="grid grid-cols-1 gap-4 landscape:sm:grid-cols-2">
          {/* 今日任务（真实数据） */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ListTodo className="size-4" />
                  今日任务
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    useTaskUiStore.getState().setPendingTab('all')
                    onNavigate('tasks')
                  }}
                >
                  全部
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5">
              {todayTasks.slice(0, 5).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onSelect={() => {
                    useTaskUiStore.getState().setPendingTab('today')
                    useTaskUiStore.getState().setPendingFocusId(t.id)
                    onNavigate('tasks')
                  }}
                />
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    useTaskUiStore.getState().setPendingTab('ddl')
                    onNavigate('tasks')
                  }}
                >
                  管理
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {upcomingEvents.map((e) => {
                const urgent = daysUntil(e.date) <= 7
                return (
                  <div
                    key={e.id}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50"
                    onClick={() => {
                      useTaskUiStore.getState().setPendingTab('ddl')
                      useTaskUiStore.getState().setPendingFocusId(e.id)
                      onNavigate('tasks')
                    }}
                  >
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Network className="size-4" />
                  成果网络
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate('graph')}>
                  查看
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {activities.length > 0 ? `${activities.length} 个活动，串成成长星图` : '添加活动后，星图会自动生成'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <NotebookPen className="size-4" />
                  反思
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate('reflection')}>
                  查看
                  <ArrowRight className="size-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {reflections.length > 0 ? `已写下 ${reflections.length} 条反思` : 'AI 采访式反思，记录经历背后的思考'}
              </p>
            </CardContent>
          </Card>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          数据 100% 存于本地浏览器 · 学栖 StudyNest
        </p>
      </div>
    </div>
  )
}
