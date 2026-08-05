import { useMemo, useRef, useState } from 'react'
import { ArrowUp, ClipboardPaste, Loader2, Slash, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { selectContextUsage, useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getSkill } from '@/lib/skills'
import { resolveForSkill } from '@/lib/capabilities'
import { cn } from '@/lib/utils'
import { ImportDialog } from './ImportDialog'
import { SlashCommandMenu } from './SlashCommandMenu'
import {
  applyCommand,
  detectSlashQuery,
  filterCommands,
  listSlashCommands,
  type SlashCommand,
  type SlashQuery,
} from './slash-commands'

/**
 * 输入框是 skill 的唯一入口。
 *
 * 以前 skill 是聊天页顶上一条独立的状态栏 + 一个下拉菜单，等于让用户
 * 在说话之前先做一次模式选择。现在打 `/` 就出命令表，skill 和前端命令
 * 同一张表——用不用 skill 是说话的一部分，不是说话之前的一道手续。
 */
export function Composer() {
  const [value, setValue] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState<SlashQuery | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const streaming = useChatStore((s) => s.streaming)
  const compacting = useChatStore((s) => s.compacting)
  const messages = useChatStore((s) => s.messages)
  const activeId = useChatStore((s) => s.activeId)
  const conversations = useChatStore((s) => s.conversations)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const compactContext = useChatStore((s) => s.compactContext)
  const newConversation = useChatStore((s) => s.newConversation)
  const exitSkill = useChatStore((s) => s.exitSkill)
  const contextWindow = useSettingsStore((s) => s.modelConfig.contextWindow)

  const usage = useMemo(() => selectContextUsage(messages, contextWindow), [messages, contextWindow])
  const activeSkill = useMemo(() => {
    const name = conversations.find((c) => c.id === activeId)?.skillName
    const skill = name ? getSkill(name) : undefined
    if (!skill) return undefined
    // 「可提案」要看实际拿到的能力面，不能只看有没有声明 capabilities——
    // 声明的全是读能力时，说成可提案是在吓唬用户
    const granted = resolveForSkill(skill.manifest).granted
    return { skill, canWrite: granted.some((c) => c.kind === 'propose') }
  }, [conversations, activeId])

  const commands = useMemo(() => (query ? filterCommands(listSlashCommands(), query.term) : []), [query])

  /**
   * 同步命令上下文。**只在命令本身变了的时候**才把选中项拨回第一条——
   * 无条件重置会让上下键失效：keydown 里刚把 activeIndex 挪一格，
   * 紧接着的 keyup 又调到这里给拨回 0。
   */
  const syncQuery = (next: string, cursor: number) => {
    const detected = detectSlashQuery(next, cursor)
    if (detected?.start !== query?.start || detected?.term !== query?.term) setActiveIndex(0)
    setQuery(detected)
  }

  /** 输入框左侧的 / 按钮：已开就收起，没开就在光标处插入 / 并唤出菜单 */
  const toggleCommandPalette = () => {
    const el = textareaRef.current
    if (query) {
      setQuery(null)
      el?.focus()
      return
    }
    const cursor = el?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    // 前面不是空白就补一个，否则不构成命令触发（普通斜杠不该弹菜单）
    const insert = before.length > 0 && !/\s$/.test(before) ? ' /' : '/'
    const next = `${before}${insert}${value.slice(cursor)}`
    const caret = cursor + insert.length
    setValue(next)
    setActiveIndex(0)
    setQuery(detectSlashQuery(next, caret))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  const choose = (command: SlashCommand) => {
    if (!query) return
    if (command.kind === 'client') {
      // 前端命令不发给模型，就地执行；把正在敲的 /xxx 从输入框里抹掉
      const cleaned = `${value.slice(0, query.start)}${value.slice(query.start + 1 + query.term.length)}`.trim()
      setValue(cleaned)
      setQuery(null)
      if (command.name === 'compact') void compactContext()
      if (command.name === 'new') void newConversation()
      textareaRef.current?.focus()
      return
    }
    const next = applyCommand(value, query, command)
    setValue(next)
    setQuery(null)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      el.focus()
      const caret = query.start + command.name.length + 2
      el.setSelectionRange(caret, caret)
    })
  }

  const submit = () => {
    const content = value.trim()
    if (!content || streaming) return
    setValue('')
    setQuery(null)
    void sendMessage(content)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query && commands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % commands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + commands.length) % commands.length)
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)) {
        e.preventDefault()
        choose(commands[activeIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setQuery(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t bg-background p-4">
      {query && (
        <SlashCommandMenu commands={commands} activeIndex={activeIndex} onHover={setActiveIndex} onSelect={choose} />
      )}

      <div className="mx-auto flex max-w-3xl flex-col gap-1 rounded-xl border bg-card p-2 shadow-xs">
        {activeSkill && (
          // 独立成卡而不是一行小字：正在遵循 skill 是个**有约束力**的状态
          // （能力面被收窄、流程被规定），得看起来像个可以退出的东西，而不像一句脚注
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 py-1 pr-1 pl-2">
            <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
            <Mono className="min-w-0 flex-1 truncate text-muted-foreground">
              正在遵循 {activeSkill.skill.manifest.displayName} · {activeSkill.canWrite ? '可提案' : '只读'}
            </Mono>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`退出 ${activeSkill.skill.manifest.displayName}`}
                  onClick={() => void exitSkill(activeSkill.skill.manifest.name)}
                >
                  <X className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>退出这个技能，回到普通对话</TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="粘贴导入" onClick={() => setImportOpen(true)}>
                <ClipboardPaste className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>粘贴通知/邮件，AI 解析为事项</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label="唤出命令面板"
                // onMouseDown 而不是 onClick：click 之前 textarea 已经失焦，
                // 插入完光标就不在输入框里了
                onMouseDown={(e) => {
                  e.preventDefault()
                  toggleCommandPalette()
                }}
              >
                <Slash className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>命令与 skill（也可以直接敲 /）</TooltipContent>
          </Tooltip>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              // 自适应高度
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
              syncQuery(e.target.value, e.target.selectionStart)
            }}
            onKeyUp={(e) => syncQuery(e.currentTarget.value, e.currentTarget.selectionStart)}
            onClick={(e) => syncQuery(e.currentTarget.value, e.currentTarget.selectionStart)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="问点什么…　/ 唤出命令"
            className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-muted-foreground"
          />
          {streaming ? (
            <Button size="icon" variant="secondary" aria-label="停止生成" onClick={stopStreaming}>
              <Square className="size-4" />
            </Button>
          ) : (
            <Button size="icon" aria-label="发送" disabled={!value.trim()} onClick={submit}>
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto mt-2 flex max-w-3xl flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-muted-foreground">
        <Mono>Enter 发送 · Shift+Enter 换行 · / 唤出命令</Mono>
        <span className="opacity-40">·</span>
        {compacting ? (
          <Mono className="flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            压缩上下文中
          </Mono>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => void compactContext()}>
                <Mono className={cn(usage.ratio > 0.8 && 'text-destructive')}>
                  上下文 {Math.min(999, Math.round(usage.ratio * 100))}%
                </Mono>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              约 {usage.tokens.toLocaleString()} / {usage.limit.toLocaleString()} token，点击立即压缩
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
