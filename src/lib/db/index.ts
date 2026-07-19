import Dexie, { type EntityTable } from 'dexie'
import type { Conversation, Message, Settings } from '@/types'

/** 本地数据库：所有用户数据只存于浏览器 IndexedDB，永不上传 */
export const db = new Dexie('student-agent') as Dexie & {
  conversations: EntityTable<Conversation, 'id'>
  messages: EntityTable<Message, 'id'>
  settings: EntityTable<Settings, 'id'>
}

db.version(1).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
})
