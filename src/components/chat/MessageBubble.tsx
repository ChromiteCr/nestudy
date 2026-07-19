import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: Message
  streaming?: boolean
}

export function MessageBubble({ message, streaming }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          'prose prose-sm dark:prose-invert max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5',
          'prose-pre:bg-background prose-pre:text-foreground',
        )}
      >
        {message.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        ) : streaming ? (
          <span className="inline-block animate-pulse text-muted-foreground">…</span>
        ) : null}
      </div>
    </div>
  )
}
