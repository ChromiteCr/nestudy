import Dexie, { type EntityTable } from 'dexie'
import type {
  Activity,
  Conversation,
  EventItem,
  GraphNodeMeta,
  Message,
  NarrativeEdge,
  Reflection,
  Settings,
  StudentProfile,
  Task,
} from '@/types'

/** 本地数据库：所有用户数据只存于浏览器 IndexedDB，永不上传 */
export const db = new Dexie('studynest') as Dexie & {
  conversations: EntityTable<Conversation, 'id'>
  messages: EntityTable<Message, 'id'>
  settings: EntityTable<Settings, 'id'>
  profile: EntityTable<StudentProfile, 'id'>
  events: EntityTable<EventItem, 'id'>
  tasks: EntityTable<Task, 'id'>
  activities: EntityTable<Activity, 'id'>
  narrativeEdges: EntityTable<NarrativeEdge, 'id'>
  graphNodeMeta: EntityTable<GraphNodeMeta, 'nodeId'>
  reflections: EntityTable<Reflection, 'id'>
}

db.version(1).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
})

db.version(2).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
  profile: 'id',
  events: 'id, date, type',
  tasks: 'id, dueDate, status, parentEventId',
})

db.version(3).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
  profile: 'id',
  events: 'id, date, type',
  tasks: 'id, dueDate, status, parentEventId',
  activities: 'id, category, startDate',
  narrativeEdges: 'id, sourceNodeId, targetNodeId',
})

db.version(4).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
  profile: 'id',
  events: 'id, date, type',
  tasks: 'id, dueDate, status, parentEventId',
  activities: 'id, category, startDate',
  narrativeEdges: 'id, sourceNodeId, targetNodeId',
  graphNodeMeta: 'nodeId',
})

db.version(5).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
  profile: 'id',
  events: 'id, date, type',
  tasks: 'id, dueDate, status, parentEventId',
  activities: 'id, category, startDate',
  narrativeEdges: 'id, sourceNodeId, targetNodeId',
  graphNodeMeta: 'nodeId',
  reflections: 'id, activityId, createdAt',
})
