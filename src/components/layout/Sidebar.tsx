import {
  CalendarRange,
  ListTodo,
  MessageSquarePlus,
  Network,
  NotebookPen,
  Puzzle,
  Settings,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'

/** 后续阶段的模块入口占位（S2 任务、S3 时间轴/网络图、S4 反思、S5 技能） */
const UPCOMING_MODULES = [
  { icon: ListTodo, label: '任务', stage: 'S2' },
  { icon: CalendarRange, label: '时间轴', stage: 'S3' },
  { icon: Network, label: '成果网络', stage: 'S3' },
  { icon: NotebookPen, label: '反思', stage: 'S4' },
  { icon: Puzzle, label: '技能', stage: 'S5' },
]

interface SidebarProps {
  onOpenSettings: () => void
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const newConversation = useChatStore((s) => s.newConversation)
  const removeConversation = useChatStore((s) => s.removeConversation)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground">
          S
        </div>
        <span className="font-heading text-sm font-semibold">Student Agent</span>
      </div>

      <div className="px-3 pb-2">
        <Button className="w-full justify-start gap-2" size="sm" onClick={() => void newConversation()}>
          <MessageSquarePlus className="size-4" />
          新会话
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        <div className="flex flex-col gap-0.5 pb-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                'group flex items-center gap-1 rounded-md text-sm',
                c.id === activeId ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'hover:bg-sidebar-accent/50',
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                onClick={() => void selectConversation(c.id)}
              >
                {c.title}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                aria-label="删除会话"
                onClick={() => void removeConversation(c.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">还没有会话</p>
          )}
        </div>
      </ScrollArea>

      <Separator />

      <div className="flex flex-col gap-0.5 px-3 py-2">
        {UPCOMING_MODULES.map((m) => (
          <Tooltip key={m.label}>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled
                className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
              >
                <m.icon className="size-4" />
                {m.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{m.stage} 阶段推出</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Separator />

      <div className="px-3 py-2">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={onOpenSettings}>
          <Settings className="size-4" />
          设置
        </Button>
      </div>
    </aside>
  )
}
