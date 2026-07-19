import { useEffect, useRef } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { Composer } from './Composer'
import { MessageBubble } from './MessageBubble'

interface ChatViewProps {
  onOpenSettings: () => void
}

export function ChatView({ onOpenSettings }: ChatViewProps) {
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const error = useChatStore((s) => s.error)
  const retryLast = useChatStore((s) => s.retryLast)
  const hasKey = useSettingsStore((s) => !!s.modelConfig.apiKey)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 新消息时滚到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <h2 className="font-heading text-lg font-semibold">你好，我是 Student Agent</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                我帮国际部学生做学习规划、背景提升和时间管理。
                {hasKey ? '说说你现在最想解决的事？' : '先在设置中填写 DeepSeek API Key，然后我们开始。'}
              </p>
              {!hasKey && (
                <Button size="sm" onClick={onOpenSettings}>
                  去设置 API Key
                </Button>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              message={m}
              streaming={streaming && i === messages.length - 1}
            />
          ))}

          {error && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              <span className="min-w-0 break-words">{error}</span>
              <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => void retryLast()}>
                <RotateCcw className="size-3.5" />
                重试
              </Button>
            </div>
          )}
        </div>
      </div>
      <Composer />
    </div>
  )
}
