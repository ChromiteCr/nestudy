import { db } from './index'
import {
  DEFAULT_MODEL_CONFIG,
  type Conversation,
  type Message,
  type ModelConfig,
  type Settings,
} from '@/types'

const SETTINGS_ID = 'app'

export function newId(): string {
  return crypto.randomUUID()
}

// ---- 会话 ----

export async function listConversations(): Promise<Conversation[]> {
  return db.conversations.orderBy('updatedAt').reverse().toArray()
}

export async function createConversation(title = '新会话'): Promise<Conversation> {
  const now = Date.now()
  const conversation: Conversation = { id: newId(), title, createdAt: now, updatedAt: now }
  await db.conversations.add(conversation)
  return conversation
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await db.conversations.update(id, { title, updatedAt: Date.now() })
}

/** skill 激活态随会话持久化，刷新页面不丢 */
export async function setConversationSkill(id: string, skillName: string | null): Promise<void> {
  await db.conversations.update(id, { skillName: skillName ?? undefined })
}

export async function touchConversation(id: string): Promise<void> {
  await db.conversations.update(id, { updatedAt: Date.now() })
}

export async function deleteConversation(id: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.messages.where('conversationId').equals(id).delete()
    await db.conversations.delete(id)
  })
}

// ---- 消息 ----

export async function listMessages(conversationId: string): Promise<Message[]> {
  const messages = await db.messages.where('conversationId').equals(conversationId).toArray()
  return messages.sort((a, b) => a.createdAt - b.createdAt)
}

export async function addMessage(message: Message): Promise<void> {
  await db.messages.add(message)
  await touchConversation(message.conversationId)
}

export async function updateMessageContent(id: string, content: string): Promise<void> {
  await db.messages.update(id, { content })
}

export async function updateMessageProposal(id: string, proposal: Message['proposal']): Promise<void> {
  await db.messages.update(id, { proposal })
}

export async function updateMessageAsk(id: string, ask: Message['ask']): Promise<void> {
  await db.messages.update(id, { ask })
}

export async function deleteMessage(id: string): Promise<void> {
  await db.messages.delete(id)
}

// ---- 设置 ----

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get(SETTINGS_ID)
  // modelConfig 会随版本长字段（S8a 的 contextWindow），旧记录补默认值再返回
  if (existing) return { ...existing, modelConfig: { ...DEFAULT_MODEL_CONFIG, ...existing.modelConfig } }
  const fresh: Settings = { id: SETTINGS_ID, modelConfig: { ...DEFAULT_MODEL_CONFIG } }
  await db.settings.put(fresh)
  return fresh
}

export async function saveModelConfig(modelConfig: ModelConfig): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, modelConfig })
}

export async function patchSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await db.settings.put(next)
  return next
}
