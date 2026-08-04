import { useState } from 'react'
import { BookOpen, ChevronRight, Wrench } from 'lucide-react'
import { Mono } from '@/components/ui/mono'
import { cn } from '@/lib/utils'
import { getSkill } from '@/lib/skills'
import { getCapability } from '@/lib/capabilities'
import { SKILL_LOADED_MARKER } from '@/lib/capabilities/core/skills'
import type { Message } from '@/types'

const PREVIEW_CHARS = 1200

interface ToolCallRowProps {
  message: Message
  /** 发起这次调用的参数，取自对应 assistant 消息 */
  args?: string
  /** 同一批出现时错开的毫秒数；undefined = 不做入场动画（旧消息、刷新回放） */
  appearDelay?: number
}

/**
 * 工具调用在消息流里的一行。
 *
 * 默认显示的是**给学生看的说法**（「查看档案」而不是 `get_profile`）：
 * 这里的读者是高中生，函数名对他只是噪音。原始工具名与参数没有删，
 * 收进展开区——要核对 agent 到底调了什么，展开一眼就能看见。
 */
export function ToolCallRow({ message, args, appearDelay }: ToolCallRowProps) {
  const [open, setOpen] = useState(false)
  const name = message.toolName ?? ''
  const capability = name ? getCapability(name) : undefined
  const skill = name === 'read_skill' ? skillFromResult(message.content) : undefined
  const failed = name !== 'read_skill' && /^\s*\{"error"/.test(message.content)

  const label = skill
    ? `读取 skill：${skill.manifest.displayName}`
    : name === 'read_skill'
      ? '读取 skill 失败'
      : ((args && capability?.describeCall?.(args)) ?? capability?.label ?? name ?? '调用工具')

  const body = skill ? skill.body : message.content
  const preview = body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS)}\n…（其余省略）` : body

  return (
    <div
      className={cn('flex justify-start', appearDelay !== undefined && 'animate-[tool-appear_320ms_ease-out_backwards]')}
      style={appearDelay !== undefined ? { animationDelay: `${appearDelay}ms` } : undefined}
    >
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
          <span className={cn('min-w-0 flex-1 truncate text-sm', failed ? 'text-destructive' : 'text-muted-foreground')}>
            {label}
          </span>
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
        </button>
        {open && (
          <div className="border-t">
            {/* 展开区才出现原始工具名与参数：机器声归机器声，别顶在最前面 */}
            <div className="flex flex-wrap items-baseline gap-x-2 border-b bg-background/40 px-2.5 py-1.5">
              <Mono className="text-muted-foreground">{name || '未知能力'}</Mono>
              {args && args !== '{}' && <Mono className="break-all opacity-60">{args}</Mono>}
            </div>
            <pre className="max-h-72 overflow-auto px-2.5 py-2 font-mono text-[0.8em] leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
              {preview}
            </pre>
          </div>
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
