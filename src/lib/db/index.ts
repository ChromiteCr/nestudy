import Dexie, { type EntityTable } from 'dexie'
import type {
  Activity,
  Artifact,
  CanvasEdge,
  CanvasNode,
  Conversation,
  EventItem,
  GraphNodeMeta,
  GrowthEvent,
  Message,
  NarrativeEdge,
  Reflection,
  Settings,
  StudentProfile,
  Task,
} from '@/types'
import { migrateLegacyTables } from './migrate-v6'

/** 本地数据库：所有用户数据只存于浏览器 IndexedDB，永不上传 */
export const db = new Dexie('studynest') as Dexie & {
  conversations: EntityTable<Conversation, 'id'>
  messages: EntityTable<Message, 'id'>
  settings: EntityTable<Settings, 'id'>
  profile: EntityTable<StudentProfile, 'id'>
  /** S6 起的统一事项表（任务 / DDL / 考试 / 活动） */
  growthEvents: EntityTable<GrowthEvent, 'id'>
  artifacts: EntityTable<Artifact, 'id'>
  canvasNodes: EntityTable<CanvasNode, 'id'>
  canvasEdges: EntityTable<CanvasEdge, 'id'>
  /** 以下六张为 v5 遗留表，v6 迁移后不再写入，v7 删除 */
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

/**
 * v6：任务 / DDL / 考试 / 活动合并为 growthEvents，反思并入 artifacts，星图换成画板。
 *
 * 六张遗留表在本版本**保留不删**——Dexie 会在 upgrade 回调之前就删掉置为 null 的表，
 * 那样迁移读不到源数据。删除留给 v7，等这套迁移在真实数据上验证过再说。
 */
db.version(6)
  .stores({
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
    growthEvents: 'id, kind, category, startDate, status, parentId',
    artifacts: 'id, kind, createdAt',
    canvasNodes: 'id',
    canvasEdges: 'id, sourceNodeId, targetNodeId, artifactId',
  })
  .upgrade(async (tx) => {
    const [events, tasks, activities, narrativeEdges, graphNodeMeta, reflections] = await Promise.all([
      tx.table('events').toArray(),
      tx.table('tasks').toArray(),
      tx.table('activities').toArray(),
      tx.table('narrativeEdges').toArray(),
      tx.table('graphNodeMeta').toArray(),
      tx.table('reflections').toArray(),
    ])
    const migrated = migrateLegacyTables({ events, tasks, activities, narrativeEdges, graphNodeMeta, reflections })
    await Promise.all([
      tx.table('growthEvents').bulkAdd(migrated.growthEvents),
      tx.table('artifacts').bulkAdd(migrated.artifacts),
      tx.table('canvasNodes').bulkAdd(migrated.canvasNodes),
      tx.table('canvasEdges').bulkAdd(migrated.canvasEdges),
    ])
  })
