import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Archive } from 'lucide-react'
import type { Message } from '@/types'
import { cn } from '@/lib/utils'
import { Mono } from '@/components/ui/mono'
import { ProposalCard } from './ProposalCard'
import { ToolCallRow } from './ToolCallRow'

interface MessageBubbleProps {
  message: Message
  /** 同会话的全部消息，用来给工具结果找回它的调用参数 */
  argsByCallId: Map<string, string>
}

export function MessageBubble({ message, argsByCallId }: MessageBubbleProps) {
  if (message.compaction) return <CompactionMarker message={message} />

  if (message.role === 'tool') {
    return <ToolCallRow message={message} args={message.toolCallId ? argsByCallId.get(message.toolCallId) : undefined} />
  }

  if (message.proposal) {
    return (
      <div className="flex justify-start">
        <ProposalCard message={message} />
      </div>
    )
  }

  // 只发起了工具调用、没说话的一轮：由跟在后面的工具行代表，这里不占位
  if (message.role === 'assistant' && !message.content) return null

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.role !== 'assistant') return null

  // 助手的话不套容器：有容器的是学生自己写下的内容，那才是这里要留存的东西
  return (
    <div className="flex justify-start">
      <div
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none',
          'prose-pre:rounded-md prose-pre:bg-muted prose-pre:text-foreground',
          'prose-code:font-mono prose-code:text-[0.85em]',
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    </div>
  )
}

/** 压缩记录：历史没被删，只是不再逐字送给模型了，这一点要说清楚 */
function CompactionMarker({ message }: { message: Message }) {
  const { droppedCount } = message.compaction!
  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <Archive className="size-3.5 shrink-0" />
      <Mono>已压缩前 {droppedCount} 条为摘要 · 原文仍保留在本机</Mono>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
