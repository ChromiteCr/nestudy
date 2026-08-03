import { MessageSquare, Settings, Waypoints } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Mono } from '@/components/ui/mono'
import { cn } from '@/lib/utils'
import type { AppView } from '@/types'

interface SidebarProps {
  view: AppView
  onViewChange: (view: AppView) => void
}

/**
 * 56px 图标导轨。不做 240px 带文字的侧栏——画板要最大宽度，
 * 而三个目标少到不需要常驻文字标签。
 */
export function Sidebar({ view, onViewChange }: SidebarProps) {
  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r bg-sidebar py-3 text-sidebar-foreground">
      <div className="flex size-8 items-center justify-center rounded-sm bg-primary text-sm font-semibold text-primary-foreground">
        栖
      </div>

      <nav className="mt-6 flex flex-col gap-1">
        <RailItem
          icon={MessageSquare}
          label="聊天"
          active={view === 'chat'}
          onClick={() => onViewChange('chat')}
        />
        <RailItem
          icon={Waypoints}
          label="画板"
          active={view === 'canvas'}
          onClick={() => onViewChange('canvas')}
        />
      </nav>

      <div className="flex-1" />

      <RailItem
        icon={Settings}
        label="设置"
        active={view === 'settings'}
        onClick={() => onViewChange('settings')}
      />
    </aside>
  )
}

interface RailItemProps {
  icon: typeof MessageSquare
  label: string
  active: boolean
  onClick: () => void
}

function RailItem({ icon: Icon, label, active, onClick }: RailItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex size-9 items-center justify-center rounded-sm transition-colors',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
          )}
        >
          <Icon className="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <Mono>{label}</Mono>
      </TooltipContent>
    </Tooltip>
  )
}
