import { create } from 'zustand'
import type { Conversation, Message } from '@/types'
import {
  addMessage,
  createConversation,
  deleteConversation,
  deleteMessage,
  listConversations,
  listMessages,
  newId,
  renameConversation,
} from '@/lib/db/repositories'
import { resolveProvider, type ChatTurn } from '@/lib/ai'
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt'
import { useSettingsStore } from './settingsStore'

interface ChatState {
  conversations: Conversation[]
  activeId: string | null
  messages: Message[]
  streaming: boolean
  error: string | null
  abortController: AbortController | null

  init: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => Promise<void>
  removeConversation: (id: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  stopStreaming: () => void
  retryLast: () => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  streaming: false,
  error: null,
  abortController: null,

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

    // 无会话时先建一个
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

    // 首条消息用开头文字作为会话标题
    if (get().messages.length === 1) {
      const title = content.trim().slice(0, 24)
      await renameConversation(conversationId, title)
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === conversationId ? { ...c, title } : c)),
      }))
    }

    await streamAssistantReply(conversationId, set, get)
  },

  stopStreaming: () => {
    get().abortController?.abort()
  },

  retryLast: async () => {
    const { messages, activeId, streaming } = get()
    if (streaming || !activeId) return
    // 移除末尾的 assistant 回复（若有），基于其余上下文重新生成
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      await deleteMessage(last.id)
      set((s) => ({ messages: s.messages.slice(0, -1) }))
    }
    await streamAssistantReply(activeId, set, get)
  },
}))

type Set = (fn: (s: ChatState) => Partial<ChatState>) => void
type Get = () => ChatState

async function streamAssistantReply(conversationId: string, set: Set, get: Get) {
  const { modelConfig } = useSettingsStore.getState()
  if (modelConfig.tier === 'custom' && !modelConfig.apiKey) {
    set(() => ({ error: '请先在设置中填写 API Key' }))
    return
  }

  const history: ChatTurn[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...get()
      .messages.filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
  ]

  const assistantMessage: Message = {
    id: newId(),
    conversationId,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  }
  const abortController = new AbortController()
  set((s) => ({
    messages: [...s.messages, assistantMessage],
    streaming: true,
    abortController,
  }))

  try {
    const provider = resolveProvider(modelConfig)
    let acc = ''
    for await (const delta of provider.streamChat(history, { signal: abortController.signal })) {
      acc += delta
      set((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMessage.id ? { ...m, content: acc } : m)),
      }))
    }
    await addMessage({ ...assistantMessage, content: acc })
  } catch (err) {
    const aborted = abortController.signal.aborted
    const partial = get().messages.find((m) => m.id === assistantMessage.id)?.content ?? ''
    if (aborted && partial) {
      // 用户手动停止：保留已生成的部分
      await addMessage({ ...assistantMessage, content: partial })
    } else if (aborted) {
      set((s) => ({ messages: s.messages.filter((m) => m.id !== assistantMessage.id) }))
    } else {
      set((s) => ({
        messages: s.messages.filter((m) => m.id !== assistantMessage.id),
        error: err instanceof Error ? err.message : '请求失败，请重试',
      }))
    }
  } finally {
    set(() => ({ streaming: false, abortController: null }))
  }
}
