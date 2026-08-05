import { create } from 'zustand'
import type { AskAnswer, AskRequest, Conversation, Message, Proposal, SkillRunStatus } from '@/types'
import {
  addMessage,
  createConversation,
  deleteConversation,
  deleteMessage,
  listConversations,
  listMessages,
  newId,
  renameConversation,
  setConversationSkill,
  updateMessageAsk,
  updateMessageProposal,
} from '@/lib/db/repositories'
import { recordSkillRun } from '@/lib/db/skill-runs'
import { resolveProvider } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'
import { applyProposal, listCapabilities } from '@/lib/capabilities'
import { DEFAULT_MAX_ROUNDS, listSkills, type LoadedSkill } from '@/lib/skills'
import { summarizeForCompaction } from '@/lib/runtime/compaction'
import { buildTurns, measureContext, MANUAL_KEEP_RECENT_TOKENS } from '@/lib/runtime/context'
import { generateConversationTitle } from '@/lib/runtime/title'
import {
  loadedSkillsFromTurns,
  narrowByLoadedSkills,
  runAgentLoop,
  type RunHandlers,
} from '@/lib/runtime/executor'
import { useSettingsStore } from './settingsStore'

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  messages: Message[]
  streaming: boolean
  /** 正在压缩上下文（与 streaming 分开，UI 说法不一样） */
  compacting: boolean
  error: string | null
  abortController: AbortController | null
  /** 进入对话视图时预置的引导语（主动提醒卡跳转用） */
  pendingPrompt: string | null

  init: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<void>
  removeConversation: (id: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => void
  retryLast: () => Promise<void>
  setPendingPrompt: (prompt: string | null) => void
  /** 手动压缩当前会话上下文（/compact） */
  compactContext: () => Promise<void>
  /** edited：卡片上用户编辑后的版本（勾选/改字段），缺省用原提案 */
  confirmProposal: (messageId: string, edited?: Proposal) => Promise<void>
  dismissProposal: (messageId: string) => Promise<void>
  /** 在问题卡上作答：回填答案并把选择当作一条用户消息发出去 */
  answerAsk: (messageId: string, answers: AskAnswer[]) => Promise<void>
  /** 跳过整张问题卡，让 agent 按默认值继续 */
  skipAsk: (messageId: string) => Promise<void>
}

/**
 * **连续**追问的次数上限。
 *
 * 治的是"一轮问一句、每句都叫最后一个问题"。计的是连续次数而不是会话总数：
 * agent 只要真拿出过东西（出了卡，或不再调工具地把话说完），计数就归零，
 * 于是长会话里该问的时候仍然问得出来，只是不许一直问下去。
 */
const ASK_STREAK_LIMIT = 2

function askStreak(messages: Message[]): number {
  let streak = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.ask) {
      streak++
      continue
    }
    if (m.proposal) break
    // 不再调工具还说了话 = 这一轮给出了实质回答
    if (m.role === 'assistant' && !m.toolCalls?.length && m.content.trim()) break
  }
  return streak
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  streaming: false,
  compacting: false,
  error: null,
  abortController: null,
  pendingPrompt: null,

  init: async () => {
    const conversations = await listConversations()
    set({ conversations })
    if (conversations.length > 0) {
      await get().selectConversation(conversations[0].id)
    }
  },

  selectConversation: async (id) => {
    const messages = await listMessages(id)
    set({ activeId: id, messages, error: null })
  },

  newConversation: async () => {
    const conversation = await createConversation()
    set((s) => ({
      conversations: [conversation, ...s.conversations],
      activeId: conversation.id,
      messages: [],
      error: null,
    }))
  },

  removeConversation: async (id) => {
    await deleteConversation(id)
    const conversations = get().conversations.filter((c) => c.id !== id)
    set({ conversations })
    if (get().activeId === id) {
      if (conversations.length > 0) await get().selectConversation(conversations[0].id)
      else set({ activeId: null, messages: [] })
    }
  },

  sendMessage: async (content) => {
    const state = get()
    if (state.streaming || !content.trim()) return

    let conversationId = state.activeId
    if (!conversationId) {
      const conversation = await createConversation()
      conversationId = conversation.id
      set((s) => ({
        conversations: [conversation, ...s.conversations],
        activeId: conversation.id,
        messages: [],
      }))
    }

    // 卡片还挂着、用户却直接在输入框说了别的：那就是跳过了。
    // 留一张永远 pending 的卡在历史里，用户会以为它还在等自己。
    for (const m of state.messages) {
      if (m.ask?.status === 'pending') await settleAsk(m.id, { ...m.ask, status: 'skipped' }, set)
    }

    const userMessage: Message = {
      id: newId(),
      conversationId,
      role: 'user',
      content: content.trim(),
      createdAt: Date.now(),
    }
    await addMessage(userMessage)
    set((s) => ({ messages: [...s.messages, userMessage], error: null }))

    // 先用首句截断当占位标题，抽屉里立刻有个能认的名字；
    // 首轮跑完再让模型换成像样的（见 maybeGenerateTitle）
    const isFirstTurn = get().messages.filter((m) => m.role === 'user').length === 1
    if (isFirstTurn) await applyTitle(conversationId, content.trim().slice(0, 24), set)

    await runConversation(conversationId, set, get)
    if (isFirstTurn && !get().error) await maybeGenerateTitle(conversationId, set, get)
  },

  stopStreaming: () => {
    get().abortController?.abort()
  },

  retryLast: async () => {
    const { messages, activeId, streaming } = get()
    if (streaming || !activeId) return
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && !last.proposal && !last.toolCalls?.length) {
      await deleteMessage(last.id)
      set((s) => ({ messages: s.messages.slice(0, -1) }))
    }
    await runConversation(activeId, set, get)
  },

  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

  compactContext: async () => {
    const { activeId, messages, streaming, compacting } = get()
    if (!activeId || streaming || compacting) return
    const { modelConfig } = useSettingsStore.getState()
    if (modelConfig.tier === 'custom' && !modelConfig.apiKey) {
      set({ error: '请先在设置中填写 API Key' })
      return
    }
    set({ compacting: true, error: null })
    try {
      const record = await compact(activeId, messages, set, MANUAL_KEEP_RECENT_TOKENS)
      if (!record) set({ error: '当前对话还不够长，没有可压缩的部分' })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '压缩失败，请重试' })
    } finally {
      set({ compacting: false })
    }
  },

  confirmProposal: async (messageId, edited) => {
    const message = get().messages.find((m) => m.id === messageId)
    const stored = message?.proposal
    if (!message || !stored || stored.status !== 'pending') return
    const proposal = edited ?? stored
    const conversation = get().conversations.find((c) => c.id === message.conversationId)
    const resultNote = await applyProposal(proposal, { skillName: conversation?.skillName })
    const updated: Proposal = { ...proposal, status: 'confirmed', resultNote }
    await updateMessageProposal(messageId, updated)
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, proposal: updated } : m)),
    }))
  },

  dismissProposal: async (messageId) => {
    const message = get().messages.find((m) => m.id === messageId)
    const proposal = message?.proposal
    if (!message || !proposal || proposal.status !== 'pending') return
    const updated: Proposal = { ...proposal, status: 'dismissed' }
    await updateMessageProposal(messageId, updated)
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, proposal: updated } : m)),
    }))
  },

  answerAsk: async (messageId, answers) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message?.ask || message.ask.status !== 'pending' || get().streaming) return
    await settleAsk(messageId, { ...message.ask, status: 'answered', answers }, set)
    // 答案作为一条**普通用户消息**回到对话里，不回填成 tool 结果：
    // 那样历史序列永远合法（不会留下悬空的 tool_call），刷新、压缩、
    // 用户改口说别的，三种情况都不用特判。
    await get().sendMessage(answers.map((a) => `${a.header}：${a.selected.join('、')}`).join('\n'))
  },

  skipAsk: async (messageId) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message?.ask || message.ask.status !== 'pending' || get().streaming) return
    await settleAsk(messageId, { ...message.ask, status: 'skipped' }, set)
    await get().sendMessage('这几个问题我先跳过，你按合理的默认值继续，把假设写清楚我再看。')
  },
}))

type Set = (patch: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void
type Get = () => ChatState

/** 问题卡定案（作答 / 跳过）：落库并转为只读回执 */
async function settleAsk(messageId: string, ask: AskRequest, set: Set) {
  await updateMessageAsk(messageId, ask)
  set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, ask } : m)) }))
}

async function applyTitle(conversationId: string, title: string, set: Set) {
  await renameConversation(conversationId, title)
  set((s) => ({
    conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, title } : c)),
  }))
}

/**
 * 首轮结束后让模型给会话起个标题。
 *
 * 多花一次模型调用，换的是抽屉里认得出哪个会话是哪个——首句截断在这个产品里
 * 尤其不够用：带 /skill-name 的开头几条会话名字长得几乎一样。
 * 失败就静默保留占位标题，不打扰用户，也不写进 error。
 */
async function maybeGenerateTitle(conversationId: string, set: Set, get: Get) {
  const { modelConfig } = useSettingsStore.getState()
  if (modelConfig.tier === 'custom' && !modelConfig.apiKey) return
  try {
    const title = await generateConversationTitle(resolveProvider(modelConfig), get().messages)
    if (title) await applyTitle(conversationId, title, set)
  } catch {
    // 起标题失败不影响对话本身，占位标题继续用
  }
}

/** 当前会话的上下文占用，输入框脚注展示用 */
export function selectContextUsage(messages: Message[], contextWindow: number) {
  // 用全量能力面估系统提示词，取上界——宁可显示得偏满，也别让用户以为还有余量
  const system = buildSystemPrompt({ capabilities: listCapabilities(), skills: listSkills() })
  return measureContext(system, messages, contextWindow)
}

/** 生成摘要并落库为一条压缩记录；返回 null 表示没什么可压的 */
async function compact(
  conversationId: string,
  messages: Message[],
  set: Set,
  keepRecentTokens?: number,
): Promise<Message | null> {
  const { modelConfig } = useSettingsStore.getState()
  const outcome = await summarizeForCompaction(resolveProvider(modelConfig), messages, { keepRecentTokens })
  if (!outcome) return null

  const record: Message = {
    id: newId(),
    conversationId,
    role: 'system',
    content: outcome.summary,
    createdAt: Date.now(),
    compaction: {
      firstKeptMessageId: outcome.plan.firstKeptMessageId,
      droppedCount: outcome.plan.dropped.length,
      beforeTokens: outcome.beforeTokens,
    },
  }
  await addMessage(record)
  set((s) => ({ messages: [...s.messages, record] }))
  return record
}

/**
 * 把一次对话交给 runtime 执行。
 * 本 store 只负责消息的落库与渲染，轮次控制、能力白名单、提案解析都在 lib/runtime 里。
 */
async function runConversation(conversationId: string, set: Set, get: Get) {
  const { modelConfig } = useSettingsStore.getState()
  if (modelConfig.tier === 'custom' && !modelConfig.apiKey) {
    set({ error: '请先在设置中填写 API Key' })
    return
  }

  const abortController = new AbortController()
  set({ streaming: true, abortController, error: null })

  const startedAt = Date.now()
  let runStatus: SkillRunStatus = 'done'
  let rounds = 0
  let proposals = 0
  let loaded: LoadedSkill[] = []

  // 流式累积中的 assistant 消息（UI 占位）。用对象持有引用：
  // 闭包内赋值不会被 TS 控制流收窄误判。
  const draft: { current: Message | null } = { current: null }

  const persist = async (message: Message) => {
    await addMessage(message)
    set((s) => ({ messages: [...s.messages, message] }))
  }

  const handlers: RunHandlers = {
    onTextDelta: (full) => {
      if (!draft.current) {
        const msg: Message = {
          id: newId(),
          conversationId,
          role: 'assistant',
          content: full,
          createdAt: Date.now(),
        }
        draft.current = msg
        set((s) => ({ messages: [...s.messages, msg] }))
        return
      }
      const id = draft.current.id
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, content: full } : m)) }))
    },
    onAssistantTurn: async (content, toolCalls) => {
      const existing = draft.current
      draft.current = null
      const message: Message = existing
        ? { ...existing, content, toolCalls: toolCalls.length ? toolCalls : undefined }
        : {
            id: newId(),
            conversationId,
            role: 'assistant',
            content,
            createdAt: Date.now(),
            toolCalls: toolCalls.length ? toolCalls : undefined,
          }
      await addMessage(message)
      // 占位消息已经在列表里，就地替换；否则追加
      set((s) => ({
        messages: existing
          ? s.messages.map((m) => (m.id === message.id ? message : m))
          : [...s.messages, message],
      }))
    },
    onToolResult: async (toolCallId, toolName, content) => {
      await persist({
        id: newId(),
        conversationId,
        role: 'tool',
        content,
        createdAt: Date.now(),
        toolCallId,
        toolName,
      })
    },
    onProposal: async (proposal) => {
      await persist({
        id: newId(),
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        proposal,
      })
    },
    onAsk: async (ask) => {
      await persist({
        id: newId(),
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        ask,
      })
    },
    onSkillLoaded: (skill) => {
      void setConversationSkill(conversationId, skill.manifest.name)
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? { ...c, skillName: skill.manifest.name } : c,
        ),
      }))
    },
  }

  try {
    // 装配前先看要不要压缩：撞上 400 再处理就晚了，那时整个会话都发不出去
    const usage = selectContextUsage(get().messages, modelConfig.contextWindow)
    if (usage.needsCompaction) {
      set({ compacting: true })
      try {
        await compact(conversationId, get().messages, set)
      } finally {
        set({ compacting: false })
      }
    }

    const history = buildTurns(get().messages)
    // 会话里读过的 skill 从历史还原：刷新之后能力面不会重新放宽
    const restored = loadedSkillsFromTurns(history)
    const base = narrowByLoadedSkills(listCapabilities(), restored)
    const maxRounds = restored.reduce((acc, s) => Math.max(acc, s.manifest.maxRounds), DEFAULT_MAX_ROUNDS)

    const result = await runAgentLoop({
      provider: resolveProvider(modelConfig),
      buildSystemPrompt: (capabilities, loadedSkills) =>
        buildSystemPrompt({
          capabilities,
          skills: listSkills(),
          loadedSkills: [...restored, ...loadedSkills],
        }),
      history,
      capabilities: base,
      maxRounds,
      askBudget: Math.max(0, ASK_STREAK_LIMIT - askStreak(get().messages)),
      signal: abortController.signal,
      handlers,
    })
    rounds = result.rounds
    proposals = result.proposals
    loaded = [...restored, ...result.loadedSkills]

    // stop === 'ask' 是正常停机，不是异常收尾：卡片自己会说话，再补一句
    // "先停在这里"只会让用户以为出了问题
    if (result.stop !== 'text' && result.stop !== 'ask') {
      await persist({
        id: newId(),
        conversationId,
        role: 'assistant',
        content:
          result.stop === 'budget'
            ? '这一轮读取的数据比较多，先停在这里。你可以继续追问或确认上面的卡片。'
            : '这一轮我调用了较多工具，先停在这里。你可以继续追问或确认上面的卡片。',
        createdAt: Date.now(),
      })
    }
  } catch (err) {
    const aborted = abortController.signal.aborted
    runStatus = aborted ? 'aborted' : 'error'
    const msg = draft.current
    const partial = msg ? (get().messages.find((m) => m.id === msg.id)?.content ?? '') : ''
    if (aborted && msg && partial) {
      await addMessage({ ...msg, content: partial })
    } else if (msg) {
      set((s) => ({ messages: s.messages.filter((m) => m.id !== msg.id) }))
      if (!aborted) set({ error: err instanceof Error ? err.message : '请求失败，请重试' })
    } else if (!aborted) {
      set({ error: err instanceof Error ? err.message : '请求失败，请重试' })
    }
  } finally {
    set({ streaming: false, abortController: null })
    // 一次运行里读过 skill 才算一次 skill run
    for (const skill of loaded) {
      await recordSkillRun({
        skillName: skill.manifest.name,
        conversationId,
        startedAt,
        finishedAt: Date.now(),
        rounds,
        proposals,
        status: runStatus,
      })
    }
  }
}
