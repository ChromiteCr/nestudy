import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAccountStore } from '@/stores/accountStore'
import { ChatDrawer } from './ChatDrawer'
import { ChatHeader } from './ChatHeader'
import { Composer } from './Composer'
import { MessageBubble } from './MessageBubble'
import { ReminderStrip } from './ReminderStrip'
import { useReminderStore } from '@/stores/reminderStore'
import { ThinkingIndicator } from './ThinkingIndicator'

/** 到达时间差在这个窗口内的算同一批（一轮里的并发工具调用） */
const APPEAR_BATCH_WINDOW_MS = 400
/** 同一批里每行错开多少 */
const APPEAR_STAGGER_MS = 110

interface ChatViewProps {
  onOpenSettings: () => void
}

export function ChatView({ onOpenSettings }: ChatViewProps) {
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const error = useChatStore((s) => s.error)
  const retryLast = useChatStore((s) => s.retryLast)
  const pendingPrompt = useChatStore((s) => s.pendingPrompt)
  /**
   * 开场白那一屏拦不拦人。
   *
   * **两条通道都要先登录**，自带 Key 也一样；在这之上，自带 Key 还得有 key。
   * 顺序就是提示的顺序：没登录就先说登录，别让人填完 key 再被拦一次。
   *
   * 判据是 `hasToken` 不是 `me`——断网时 `me` 是 null 但人确实登录过，
   * 而这一屏和 `resolveProvider` 那道门必须说同一件事。
   */
  const needsKey = useSettingsStore((s) => s.modelConfig.tier === 'custom' && !s.modelConfig.apiKey)
  const signedIn = useAccountStore((s) => s.hasToken)
  const ready = signedIn && !needsKey
  const scrollRef = useRef<HTMLDivElement>(null)
  /** 他是不是正贴着底看。滚到上面读旧消息时，任何新东西都不该把他拽走 */
  const atBottomRef = useRef(true)
  const reminderCount = useReminderStore((s) => s.reminders.length)
  // 挂载之前就存在的消息不做入场动画：否则每次刷新/切会话，
  // 满屏工具行都要重放一遍级联，那不是提示新内容，那是噪音
  const mountedAt = useRef(Date.now())
  // 工具结果那一行要显示调用参数，参数存在发起它的 assistant 消息上
  const argsByCallId = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of messages) {
      for (const call of m.toolCalls ?? []) map.set(call.id, call.arguments)
    }
    return map
  }, [messages])

  /**
   * 入场动画的错开量。
   *
   * 一轮里的几个工具几乎同时执行完（读的都是本地 IndexedDB），于是它们在**同一次
   * React 提交**里挂载，动画同时开始——看上去就是"啪地一起蹦出来"，等于没有动画。
   * 按次序错开才看得出是一件件做完的。
   *
   * 分组依据是**到达时间**而不是在消息流里的位置：同一次提交里挂载的才需要错开。
   * 按位置累计的话，一条长工具链跑到第八个时会被推迟近一秒才现身——
   * 那不是节奏，那是卡顿。
   */
  const appearDelays = useMemo(() => {
    const map = new Map<string, number>()
    let batchStart = -Infinity
    let indexInBatch = 0
    for (const m of messages) {
      if (m.role !== 'tool' && !m.proposal && !m.ask) continue
      if (m.createdAt - batchStart > APPEAR_BATCH_WINDOW_MS) {
        batchStart = m.createdAt
        indexInBatch = 0
      }
      if (m.createdAt >= mountedAt.current) map.set(m.id, indexInBatch * APPEAR_STAGGER_MS)
      indexInBatch++
    }
    return map
  }, [messages])
  // 与画板抽屉同一取舍：窄屏默认收起，展开时浮层覆盖而不是挤压正文
  const [drawerOpen, setDrawerOpen] = useState(() => window.innerWidth >= 768)

  /*
    新消息/思考指示/提醒条变化时滚到底部，**但只在他原本就贴着底的时候**。
    提醒条是滚动容器的兄弟节点，多一行就把整个消息区往下推——
    「打断」在物理层面就是这个视口跳位，不是措辞问题。
    同时改掉一个既有行为：以前不管他滚到哪儿，新消息都会硬把他拽到底
  */
  useEffect(() => {
    if (!atBottomRef.current) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, streaming, reminderCount])

  // 带引导语进入（建档 CTA / 提醒卡跳转）：新开会话并自动发送。
  // 从 getState() 复核最新值：StrictMode 下 effect 会连跑两次，
  // 第二次时 pendingPrompt 已被清空，避免重复发送。
  useEffect(() => {
    const store = useChatStore.getState()
    const prompt = store.pendingPrompt
    if (!prompt || store.streaming) return
    store.setPendingPrompt(null)
    void store.newConversation().then(() => store.sendMessage(prompt))
  }, [pendingPrompt, streaming])

  return (
    <div className="relative flex h-full min-w-0 flex-1">
      {drawerOpen && <ChatDrawer />}
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader drawerOpen={drawerOpen} onToggleDrawer={() => setDrawerOpen((v) => !v)} />
        <ReminderStrip />
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={() => {
            const el = scrollRef.current
            if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
          }}
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <div className="flex size-12 items-center justify-center rounded-sm bg-accent">
                  <Sparkles className="size-5 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold">你好，我是学栖</h2>
                <p className="max-w-md leading-relaxed text-muted-foreground">
                  我帮国际部学生做学习规划、背景提升和时间管理。
                  {ready
                    ? '说说你现在最想解决的事？'
                    : !signedIn
                      ? '先去设置里登录，用邮箱收个验证码就行。'
                      : '先在设置里填一个模型 API Key，然后我们开始。'}
                </p>
                {!ready && (
                  <Button size="sm" onClick={onOpenSettings}>
                    {!signedIn ? '去登录' : '去设置 API Key'}
                  </Button>
                )}
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                argsByCallId={argsByCallId}
                appearDelay={appearDelays.get(m.id)}
              />
            ))}

            {/* 等待模型产出文本时（含工具轮次间隙）显示思考指示 */}
            {streaming &&
              !(
                messages.length > 0 &&
                messages[messages.length - 1].role === 'assistant' &&
                messages[messages.length - 1].content &&
                !messages[messages.length - 1].proposal &&
                !messages[messages.length - 1].ask
              ) && <ThinkingIndicator />}

            {error && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-destructive">
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
    </div>
  )
}
