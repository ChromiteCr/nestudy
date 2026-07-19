import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { ProposalCard } from './ProposalCard'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (message.proposal) {
    return (
      <div className="flex justify-start">
        <ProposalCard message={message} />
      </div>
    )
  }

  // 空的 assistant 占位（流式尚未产出文本）由 ThinkingIndicator 呈现
  if (!isUser && !message.content) return null

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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    </div>
  )
}
