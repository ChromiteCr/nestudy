import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'

interface ChatHeaderProps {
  drawerOpen: boolean
  onToggleDrawer: () => void
}

export function ChatHeader({ drawerOpen, onToggleDrawer }: ChatHeaderProps) {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const active = conversations.find((c) => c.id === activeId)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label={drawerOpen ? '收起对话列表' : '展开对话列表'}
        onClick={onToggleDrawer}
      >
        {drawerOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
      </Button>
      <span className="min-w-0 flex-1 truncate">{active?.title ?? '新对话'}</span>
      <Mono className="shrink-0 text-muted-foreground">{conversations.length} 个对话</Mono>
    </header>
  )
}
