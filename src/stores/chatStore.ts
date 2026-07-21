import { create } from 'zustand'
import type { Message, Proposal } from '@/types'
import {
  addMessage,
  createConversation,
  deleteConversation,
  deleteMessage,
  listConversations,
  listMessages,
  newId,
  renameConversation,
  updateMessageProposal,
} from '@/lib/db/repositories'
import { resolveProvider, type ChatTurn } from '@/lib/ai'
import { buildSystemPrompt } from '@/lib/ai/system-prompt'
import { AGENT_TOOLS, executeReadTool, isProposeTool, isReadTool } from '@/lib/ai/tools'
import { getSkill } from '@/lib/skills/registry'
import { useSkillStore } from './skillStore'
import {
  applyActivitiesProposal,
  applyImportProposal,
  applyNarrativeProposal,
  applyProfileProposal,
  parseActivitiesArgs,
  parseImportArgs,
  parseNarrativeArgs,
  parseProfileArgs,
} from '@/lib/ai/proposals'
import { useSettingsStore } from './settingsStore'
import type { Conversation } from '@/types'

/** agent loop 轮数上限（每轮=一次模型调用） */
const MAX_ROUNDS = 4

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
      if (conversations.length > 0) {
        await get().selectConversation(conversations[0].id)
      } else {
        set({ activeId: null, messages: [] })
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

    await runAgentLoop(conversationId, set, get)
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
    await runAgentLoop(activeId, set, get)
  },

  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

  confirmProposal: async (messageId, edited) => {
    const message = get().messages.find((m) => m.id === messageId)
    const stored = message?.proposal
    if (!message || !stored || stored.status !== 'pending') return
    const proposal = edited ?? stored
    let resultNote: string
    if (proposal.kind === 'import') {
      resultNote = await applyImportProposal(proposal.events, proposal.tasks)
    } else if (proposal.kind === 'activities') {
      resultNote = await applyActivitiesProposal(proposal.activities)
    } else if (proposal.kind === 'narrative') {
      resultNote = await applyNarrativeProposal(proposal.edges)
    } else {
      resultNote = await applyProfileProposal(proposal.patch)
    }
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
 * Agent loop：流式调用模型；读工具自动执行后继续下一轮；
 * 提案工具生成确认卡消息；纯文本回复结束循环。
 */
async function runAgentLoop(conversationId: string, set: Set, get: Get) {
  const { modelConfig } = useSettingsStore.getState()
  if (modelConfig.tier === 'custom' && !modelConfig.apiKey) {
    set(() => ({ error: '请先在设置中填写 API Key' }))
    return
  }

  // 激活的 skill（若有）追加人设并收窄工具面，不允许的工具连 schema 都不下发给模型
  const activeSkill = useSkillStore.getState().activeSkillId
  const skill = activeSkill ? getSkill(activeSkill) : undefined
  const systemPrompt = skill ? `${buildSystemPrompt()}\n\n---\n${skill.personaPrompt}` : buildSystemPrompt()
  const tools = skill ? AGENT_TOOLS.filter((t) => skill.allowedTools.includes(t.name)) : AGENT_TOOLS
  const allowedToolNames = new Set(tools.map((t) => t.name))

  // 历史只带 user/assistant 文本（工具轮次为回合内临时上下文）
  const convo: ChatTurn[] = [
    { role: 'system', content: systemPrompt },
    ...get()
      .messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]

  const abortController = new AbortController()
  set(() => ({ streaming: true, abortController, error: null }))

  // 当前正在流式累积的 assistant 消息（UI 占位）。
  // 用对象持有引用：闭包内赋值不会被 TS 控制流收窄误判。
  const msgRef: { current: Message | null } = { current: null }
  const ensureCurrentMessage = () => {
    if (msgRef.current) return
    const msg: Message = {
      id: newId(),
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    }
    msgRef.current = msg
    set((s) => ({ messages: [...s.messages, msg] }))
  }
  const updateCurrentContent = (content: string) => {
    const msg = msgRef.current
    if (!msg) return
    set((s) => ({
      messages: s.messages.map((m) => (m.id === msg.id ? { ...m, content } : m)),
    }))
  }

  try {
    const provider = resolveProvider(modelConfig)

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let text = ''
      let toolCalls: Awaited<ReturnType<typeof collectRound>>['toolCalls'] = []

      const result = await collectRound(
        provider.streamChat(convo, { signal: abortController.signal, tools }),
        (delta) => {
          text += delta
          ensureCurrentMessage()
          updateCurrentContent(text)
        },
      )
      toolCalls = result.toolCalls

      if (toolCalls.length === 0) {
        // 纯文本回复：落库收尾
        if (msgRef.current && text) {
          await addMessage({ ...msgRef.current, content: text })
        }
        return
      }

      // 有工具调用：本轮文本（若有）先落库定格
      if (msgRef.current && text) {
        await addMessage({ ...msgRef.current, content: text })
      }
      msgRef.current = null

      convo.push({ role: 'assistant', content: text, toolCalls })

      for (const call of toolCalls) {
        if (!allowedToolNames.has(call.name)) {
          convo.push({ role: 'tool', toolCallId: call.id, content: '该工具在当前 skill 下不可用' })
          continue
        }
        if (isReadTool(call.name)) {
          const result = await executeReadTool(call.name)
          convo.push({ role: 'tool', toolCallId: call.id, content: result })
        } else if (isProposeTool(call.name)) {
          let proposal: Proposal | null = null
          try {
            if (call.name === 'propose_import') {
              proposal = { kind: 'import', ...parseImportArgs(call.arguments), status: 'pending' }
            } else if (call.name === 'propose_activities') {
              proposal = { kind: 'activities', activities: parseActivitiesArgs(call.arguments), status: 'pending' }
            } else if (call.name === 'propose_narrative') {
              proposal = { kind: 'narrative', edges: parseNarrativeArgs(call.arguments), status: 'pending' }
            } else {
              proposal = { kind: 'profile', patch: parseProfileArgs(call.arguments), status: 'pending' }
            }
          } catch {
            convo.push({ role: 'tool', toolCallId: call.id, content: '参数 JSON 解析失败，请修正后重试' })
            continue
          }
          const isEmpty =
            proposal.kind === 'import'
              ? proposal.events.length === 0 && proposal.tasks.length === 0
              : proposal.kind === 'activities'
                ? proposal.activities.length === 0
                : proposal.kind === 'narrative'
                  ? proposal.edges.length === 0
                  : Object.keys(proposal.patch).length === 0
          if (isEmpty) {
            convo.push({ role: 'tool', toolCallId: call.id, content: '提案为空，未展示。请确认解析内容后重试或直接告知用户。' })
            continue
          }
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
          convo.push({
            role: 'tool',
            toolCallId: call.id,
            content: '提案卡已展示给用户，等待用户在卡片上确认或编辑。不要重复调用，也不要声称已保存。',
          })
        } else {
          convo.push({ role: 'tool', toolCallId: call.id, content: `未知工具：${call.name}` })
        }
      }
    }

    // 轮数用尽：礼貌收尾
    const fallback: Message = {
      id: newId(),
      conversationId,
      role: 'assistant',
      content: '这一轮我调用了较多工具，先停在这里。你可以继续追问或确认上面的卡片。',
      createdAt: Date.now(),
    }
    await addMessage(fallback)
    set((s) => ({ messages: [...s.messages, fallback] }))
  } catch (err) {
    const aborted = abortController.signal.aborted
    const msg = msgRef.current
    const partial = msg ? get().messages.find((m) => m.id === msg.id)?.content ?? '' : ''
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
  }
}

async function collectRound(
  stream: AsyncIterable<import('@/lib/ai').StreamEvent>,
  onText: (delta: string) => void,
) {
  const toolCalls: import('@/lib/ai').ToolCallRequest[] = []
  for await (const event of stream) {
    if (event.type === 'text') onText(event.text)
    else toolCalls.push(...event.calls)
  }
  return { toolCalls }
}
