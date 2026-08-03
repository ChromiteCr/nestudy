import { useEffect, useRef } from 'react'
import { Sparkles, Terminal } from 'lucide-react'
import { Mono } from '@/components/ui/mono'
import { cn } from '@/lib/utils'
import type { SlashCommand } from './slash-commands'

interface SlashCommandMenuProps {
  commands: SlashCommand[]
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (command: SlashCommand) => void
}

/** 输入框上方的命令菜单：skill 与前端命令同一张表，键盘可选 */
export function SlashCommandMenu({ commands, activeIndex, onHover, onSelect }: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (commands.length === 0) return null

  return (
    <div
      ref={listRef}
      className="mx-auto mb-2 flex max-h-64 w-full max-w-3xl flex-col overflow-y-auto rounded-xl border bg-popover p-1 shadow-md"
    >
      {commands.map((command, i) => (
        <button
          key={`${command.kind}:${command.name}`}
          type="button"
          data-active={i === activeIndex}
          onMouseEnter={() => onHover(i)}
          // onMouseDown 而不是 onClick：click 之前 textarea 已经失焦，选完就没法接着打字了
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(command)
          }}
          className={cn(
            'flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
            i === activeIndex ? 'bg-accent' : 'hover:bg-accent/60',
          )}
        >
          {command.kind === 'skill' ? (
            <Sparkles className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Terminal className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-baseline gap-2">
              <Mono>/{command.name}</Mono>
              <span className="truncate text-sm text-muted-foreground">{command.label}</span>
            </div>
            <span className="line-clamp-2 text-sm text-muted-foreground">{command.description}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
