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
    const list = listRef.current
    // 只在真的滚得动的时候才滚。列表没溢出时 scrollIntoView 会去动祖先滚动容器
    // （聊天区），表现为按一下方向键整页闪一下
    if (!list || list.scrollHeight <= list.clientHeight) return
    list.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (commands.length === 0) return null

  return (
    <div
      ref={listRef}
      className="mx-auto mb-2 flex max-h-72 w-full max-w-3xl flex-col overflow-y-auto rounded-xl border bg-popover p-1 shadow-md"
    >
      {commands.map((command, i) => (
        <button
          key={`${command.kind}:${command.name}`}
          type="button"
          data-active={i === activeIndex}
          // 必须是 mousemove 不能是 mouseenter：mouseenter 在「元素移动到静止的
          // 指针底下」时也会触发。指针停在菜单上时，方向键改选中项 → 列表重排/滚动
          // → 光标底下换了一个 item → mouseenter 把选中项抢回鼠标所在那条。
          // 表现就是「闪一下又跳回第一个」。mousemove 只在指针真的动了才触发。
          onMouseMove={() => i !== activeIndex && onHover(i)}
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
            {/* 窄屏下要截也是截 kebab 名，不能截通俗名：学生是按「活动栏压缩」认的，
                /activity-list-optimizer 只是选中后自动填进输入框的那串字。
                原来反了——机器名换行占满两行，通俗名被压成「活动栏…」 */}
            <div className="flex items-baseline gap-2">
              <Mono className="min-w-0 truncate">/{command.name}</Mono>
              <span className="shrink-0 text-sm text-muted-foreground">{command.label}</span>
            </div>
            {/* 描述是写给模型的触发语，长且啰嗦。在这里只起「确认没选错」的作用——
                真正用来挑的是上面那行通俗名。压到最小一档并只留一行：
                九条命令原本只露得出三条，翻页找 skill 比读清描述烦得多 */}
            <span className="line-clamp-1 text-2xs text-muted-foreground">{command.description}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
