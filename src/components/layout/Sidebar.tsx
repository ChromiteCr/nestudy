import {
  CalendarRange,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MessageSquarePlus,
  Network,
  NotebookPen,
  Settings,
  Trash2,
  Trophy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import type { AppView } from '@/types'

interface SidebarProps {
  view: AppView
  onViewChange: (view: AppView) => void
  onOpenSettings: () => void
}

export function Sidebar({ view, onViewChange, onOpenSettings }: SidebarProps) {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const newConversation = useChatStore((s) => s.newConversation)
  const removeConversation = useChatStore((s) => s.removeConversation)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary font-heading text-sm font-bold text-primary-foreground">
          栖
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-heading text-sm font-semibold">学栖</span>
          <span className="text-[10px] text-muted-foreground">StudyNest</span>
        </div>
      </div>

      {/* 主导航 */}
      <nav className="flex flex-col gap-0.5 px-3 pb-2">
        <NavItem
          icon={LayoutDashboard}
          label="面板"
          active={view === 'dashboard'}
          onClick={() => onViewChange('dashboard')}
        />
        <NavItem
          icon={MessageSquare}
          label="对话"
          active={view === 'chat'}
          onClick={() => onViewChange('chat')}
        />
        <NavItem
          icon={ListTodo}
          label="任务"
          active={view === 'tasks'}
          onClick={() => onViewChange('tasks')}
        />
        <NavItem
          icon={Trophy}
          label="活动"
          active={view === 'activities'}
          onClick={() => onViewChange('activities')}
        />
        <NavItem
          icon={CalendarRange}
          label="时间轴"
          active={view === 'timeline'}
          onClick={() => onViewChange('timeline')}
        />
        <NavItem
          icon={Network}
          label="成果网络"
          active={view === 'graph'}
          onClick={() => onViewChange('graph')}
        />
        <NavItem
          icon={NotebookPen}
          label="反思"
          active={view === 'reflection'}
          onClick={() => onViewChange('reflection')}
        />
      </nav>

      <Separator />

      {/* 对话视图下显示会话列表 */}
      {view === 'chat' ? (
        <>
          <div className="px-3 pb-2 pt-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              size="sm"
              onClick={() => void newConversation()}
            >
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
                    c.id === activeId
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50',
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
        </>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

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

interface NavItemProps {
  icon: typeof LayoutDashboard
  label: string
  active: boolean
  onClick: () => void
}

function NavItem({ icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  )
}
