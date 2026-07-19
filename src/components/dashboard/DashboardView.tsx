import {
  ArrowRight,
  CalendarClock,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useChatStore } from '@/stores/chatStore'
import type { AppView } from '@/types'

/** 面板占位卡片：内容随对应阶段落地（S2 任务/DDL、S3 网络图、S4 反思） */
const PLACEHOLDER_CARDS = [
  {
    icon: ListTodo,
    title: '今日任务',
    stage: 'S2',
    description: '每日该做什么，完成打勾、自动顺延',
  },
  {
    icon: CalendarClock,
    title: '近期 DDL',
    stage: 'S2',
    description: '所有截止日期聚合、倒计时与预警',
  },
  {
    icon: Network,
    title: '成果网络',
    stage: 'S3',
    description: '活动、课程与成果串成叙事网络',
  },
  {
    icon: NotebookPen,
    title: '反思',
    stage: 'S4',
    description: '活动结束后的 AI 采访式反思记录',
  },
]

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

        {/* 模块占位 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLACEHOLDER_CARDS.map((card) => (
            <Card key={card.title} className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <card.icon className="size-4" />
                    {card.title}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {card.stage} 推出
                  </span>
                </CardTitle>
                <CardDescription>{card.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-16 rounded-md bg-muted/40" />
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          数据 100% 存于本地浏览器 · 学栖 StudyNest
        </p>
      </div>
    </div>
  )
}
