import { useState } from 'react'
import { BookOpen, ChevronRight, Wrench } from 'lucide-react'
import { Mono } from '@/components/ui/mono'
import { cn } from '@/lib/utils'
import { getSkill } from '@/lib/skills'
import { SKILL_LOADED_MARKER } from '@/lib/capabilities/core/skills'
import type { Message } from '@/types'

const PREVIEW_CHARS = 1200

interface ToolCallRowProps {
  message: Message
  /** 发起这次调用的参数，取自对应 assistant 消息 */
  args?: string
}

/**
 * 工具调用在消息流里的一行。
 *
 * 展开才看得到结果——默认折叠是因为这些是**机器声**：学生要知道 agent 做了什么，
 * 但不该被一屏 JSON 淹没。读 skill 单独给个说法，那是这次会话里最该被看见的一步。
 */
export function ToolCallRow({ message, args }: ToolCallRowProps) {
  const [open, setOpen] = useState(false)
  const name = message.toolName ?? '未知能力'
  const skill = name === 'read_skill' ? skillFromResult(message.content) : undefined
  const failed = name !== 'read_skill' && /^\s*\{"error"/.test(message.content)

  const label = skill
    ? `读取 skill：${skill.manifest.displayName}`
    : name === 'read_skill'
      ? '读取 skill 失败'
      : name

  const body = skill ? skill.body : message.content
  const preview = body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS)}\n…（其余省略）` : body

  return (
    <div className="flex animate-[tool-appear_220ms_ease-out] justify-start">
      <div className="w-full max-w-[85%] overflow-hidden rounded-lg border bg-muted/40">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-accent/50"
        >
          {skill ? (
            <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <Mono className={cn('min-w-0 flex-1 truncate', failed ? 'text-destructive' : 'text-muted-foreground')}>
            {label}
            {args && args !== '{}' && <span className="opacity-60"> {compactArgs(args)}</span>}
          </Mono>
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
        </button>
        {open && (
          <pre className="max-h-72 overflow-auto border-t px-2.5 py-2 font-mono text-[0.8em] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">
            {preview}
          </pre>
        )}
      </div>
    </div>
  )
}

function skillFromResult(content: string) {
  const at = content.lastIndexOf(SKILL_LOADED_MARKER)
  if (at === -1) return undefined
  return getSkill(content.slice(at + SKILL_LOADED_MARKER.length).trim())
}

/** 参数压成一行摘要：`{"kind":"long"}` → kind=long */
function compactArgs(args: string): string {
  try {
    const parsed = JSON.parse(args) as Record<string, unknown>
    const entries = Object.entries(parsed).filter(([, v]) => v !== undefined && v !== null)
    if (entries.length === 0) return ''
    const text = entries
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' ')
    return text.length > 60 ? `${text.slice(0, 60)}…` : text
  } catch {
    return ''
  }
}
