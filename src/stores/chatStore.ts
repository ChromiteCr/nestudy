import { create } from 'zustand'
import type { Conversation, Message, Proposal, SkillRunStatus } from '@/types'
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
  updateMessageProposal,
} from '@/lib/db/repositories'
import { recordSkillRun } from '@/lib/db/skill-runs'
import { resolveProvider, type ChatTurn } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'
import { applyProposal, resolveForSkill } from '@/lib/capabilities'
import { DEFAULT_MAX_ROUNDS, getSkill } from '@/lib/skills'
import { runAgentLoop, type RunHandlers } from '@/lib/runtime/executor'
import { useSkillStore } from './skillStore'
import { useSettingsStore } from './settingsStore'

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  messages: Message[]
  streaming: boolean
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
  /** edited：卡片上用户编辑后的版本（勾选/改字段），缺省用原提案 */
  confirmProposal: (messageId: string, edited?: Proposal) => Promise<void>
  dismissProposal: (messageId: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  streaming: false,
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
    const conversation = get().conversations.find((c) => c.id === id)
    set({ activeId: id, messages, error: null })
    useSkillStore.getState().hydrate(id, conversation?.skillName ?? null)
  },

  newConversation: async () => {
    const conversation = await createConversation()
    set((s) => ({
      conversations: [conversation, ...s.conversations],
      activeId: conversation.id,
      messages: [],
      error: null,
    }))
    // 新会话不继承上一个会话的 skill：换个话题就该是干净的学栖本体
    useSkillStore.getState().hydrate(conversation.id, null)
  },

  removeConversation: async (id) => {
    await deleteConversation(id)
    const conversations = get().conversations.filter((c) => c.id !== id)
    set({ conversations })
    if (get().activeId === id) {
      if (conversations.length > 0) {
        await get().selectConversation(conversations[0].id)
      } else {
        set({ activeId: null, messages: [] })
        useSkillStore.getState().hydrate(null, null)
      }
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
      // 用户可能先选了 skill 再说第一句话，这时会话才刚建出来，补写激活态
      const { activeSkillName } = useSkillStore.getState()
      useSkillStore.getState().hydrate(conversation.id, activeSkillName)
      if (activeSkillName) await setConversationSkill(conversation.id, activeSkillName)
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

    if (get().messages.length === 1) {
      const title = content.trim().slice(0, 24)
      await renameConversation(conversationId, title)
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, title } : c)),
      }))
    }

    await runConversation(conversationId, set, get)
  },

  stopStreaming: () => {
    get().abortController?.abort()
  },

  retryLast: async () => {
    const { messages, activeId, streaming } = get()
    if (streaming || !activeId) return
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant' && !last.proposal) {
      await deleteMessage(last.id)
      set((s) => ({ messages: s.messages.slice(0, -1) }))
    }
    await runConversation(activeId, set, get)
  },

  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

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
}))

type Set = (fn: (s: ChatState) => Partial<ChatState>) => void
type Get = () => ChatState

/**
 * 把一次对话交给 runtime 执行：本 store 只负责消息的落库与渲染，
 * 轮次控制、工具白名单、提案解析都在 `lib/runtime/executor.ts` 里。
 */
async function runConversation(conversationId: string, set: Set, get: Get) {
  const { modelConfig } = useSettingsStore.getState()
  if (modelConfig.tier === 'custom' && !modelConfig.apiKey) {
    set(() => ({ error: '请先在设置中填写 API Key' }))
    return
  }

  const skillName = useSkillStore.getState().activeSkillName
  const skill = skillName ? getSkill(skillName) : undefined
  const { granted, missing } = resolveForSkill(skill?.manifest ?? null)
  if (skill && missing.length > 0) {
    set(() => ({ error: `「${skill.manifest.displayName}」需要的能力当前不可用：${missing.join('、')}` }))
    return
  }

  // 历史只带 user/assistant 文本（工具轮次为回合内临时上下文）
  const history: ChatTurn[] = get()
    .messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const abortController = new AbortController()
  set(() => ({ streaming: true, abortController, error: null }))

  // 当前正在流式累积的 assistant 消息（UI 占位）。
  // 用对象持有引用：闭包内赋值不会被 TS 控制流收窄误判。
  const msgRef: { current: Message | null } = { current: null }
  const handlers: RunHandlers = {
    onTextDelta: (full) => {
      if (!msgRef.current) {
        const msg: Message = {
          id: newId(),
          conversationId,
          role: 'assistant',
          content: full,
          createdAt: Date.now(),
        }
        msgRef.current = msg
        set((s) => ({ messages: [...s.messages, msg] }))
        return
      }
      const id = msgRef.current.id
      set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, content: full } : m)) }))
    },
    onTextEnd: async (full) => {
      if (!msgRef.current) return
      await addMessage({ ...msgRef.current, content: full })
      msgRef.current = null
    },
    onProposal: async (proposal) => {
      const proposalMessage: Message = {
        id: newId(),
        conversationId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        proposal,
      }
      await addMessage(proposalMessage)
      set((s) => ({ messages: [...s.messages, proposalMessage] }))
    },
  }

  const startedAt = Date.now()
  let runStatus: SkillRunStatus = 'done'
  let rounds = 0
  let proposals = 0

  try {
    const result = await runAgentLoop({
      provider: resolveProvider(modelConfig),
      systemPrompt: buildSystemPrompt(granted, skill),
      history,
      capabilities: granted,
      maxRounds: skill?.manifest.maxRounds ?? DEFAULT_MAX_ROUNDS,
      signal: abortController.signal,
      handlers,
    })
    rounds = result.rounds
    proposals = result.proposals

    if (result.stop !== 'text') {
      const fallback: Message = {
        id: newId(),
        conversationId,
        role: 'assistant',
        content:
          result.stop === 'budget'
            ? '这一轮读取的数据比较多，先停在这里。你可以继续追问或确认上面的卡片。'
            : '这一轮我调用了较多工具，先停在这里。你可以继续追问或确认上面的卡片。',
        createdAt: Date.now(),
      }
      await addMessage(fallback)
      set((s) => ({ messages: [...s.messages, fallback] }))
    }
  } catch (err) {
    const aborted = abortController.signal.aborted
    runStatus = aborted ? 'aborted' : 'error'
    const msg = msgRef.current
    const partial = msg ? (get().messages.find((m) => m.id === msg.id)?.content ?? '') : ''
    if (aborted && msg && partial) {
      await addMessage({ ...msg, content: partial })
    } else if (msg) {
      set((s) => ({ messages: s.messages.filter((m) => m.id !== msg.id) }))
      if (!aborted) {
        set(() => ({ error: err instanceof Error ? err.message : '请求失败，请重试' }))
      }
    } else if (!aborted) {
      set(() => ({ error: err instanceof Error ? err.message : '请求失败，请重试' }))
    }
  } finally {
    set(() => ({ streaming: false, abortController: null }))
    if (skill) {
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
