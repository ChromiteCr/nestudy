import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'

/**
 * 会话抽屉。和画板抽屉同一套结构：宽屏并排、窄屏浮层覆盖，
 * 免得 288px 的抽屉把正文挤没。
 */
export function ChatDrawer() {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const selectConversation = useChatStore((s) => s.selectConversation)
  const newConversation = useChatStore((s) => s.newConversation)
  const removeConversation = useChatStore((s) => s.removeConversation)

  return (
    <aside className="absolute inset-y-0 left-0 z-10 flex w-72 shrink-0 flex-col border-r bg-sidebar md:relative md:z-auto">
      <div className="p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 bg-card"
          onClick={() => void newConversation()}
        >
          <Plus className="size-4" />
          新对话
        </Button>
      </div>

      <Mono className="px-4 pb-1 text-muted-foreground">对话</Mono>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <p className="px-2 py-2 text-sm text-muted-foreground">还没有对话</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              'group flex items-center gap-1 rounded-md transition-colors',
              c.id === activeId
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'hover:bg-sidebar-accent/60',
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm"
              onClick={() => void selectConversation(c.id)}
            >
              {c.title}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="mr-1 size-7 shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="删除对话"
              onClick={() => void removeConversation(c.id)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </aside>
  )
}
