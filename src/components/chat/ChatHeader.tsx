import { ChevronDown, MessageSquarePlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'

/**
 * 会话切换从侧栏移到聊天页自己的头部——56px 导轨放不下会话列表，
 * 而会话本来就只跟聊天有关，不该占据全局导航的位置。
 */
export function ChatHeader() {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const newConversation = useChatStore((s) => s.newConversation)
  const removeConversation = useChatStore((s) => s.removeConversation)

  const active = conversations.find((c) => c.id === activeId)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="-ml-2 max-w-xs gap-1.5">
            <span className="truncate">{active?.title ?? '新会话'}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onSelect={() => void newConversation()}>
            <MessageSquarePlus className="size-4" />
            新会话
          </DropdownMenuItem>
          {conversations.length > 0 && <DropdownMenuSeparator />}
          {conversations.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={() => void selectConversation(c.id)}
              className="group justify-between"
            >
              <span className="min-w-0 truncate">{c.title}</span>
              <button
                type="button"
                aria-label="删除会话"
                className="shrink-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  void removeConversation(c.id)
                }}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Mono className="text-muted-foreground">{conversations.length} 个会话</Mono>
    </header>
  )
}
