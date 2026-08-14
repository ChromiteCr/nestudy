import Dexie, { type EntityTable } from 'dexie'
import type {
  Application,
  Artifact,
  CanvasEdge,
  CanvasNode,
  Conversation,
  GrowthEvent,
  Message,
  Settings,
  SkillRun,
  StudentProfile,
  UserSkill,
} from '@/types'
import { migrateLegacyTables } from './migrate-v6'

/**
 * 本地数据库：所有用户数据只存于浏览器 IndexedDB，永不上传。
 *
 * **库名 `studynest` 是历史名，改名时刻意没有跟着改。** IndexedDB 按库名寻址：
 * 换个名字等于开一个空库，老库还在磁盘上但应用再也看不见——用户两年的事项、
 * 反思、画板、API Key 一次性"消失"。为一个内部标识符付这个代价不值得。
 *
 * 真要统一命名，得先写一段跨库搬运（开旧库 → 逐表复制 → 校验 → 删旧库），
 * 那是一次独立的迁移，不是改一个字符串。
 */
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
  /** S8 起的 skill 运行记录 */
  skillRuns: EntityTable<SkillRun, 'id'>
  /** S9 起的申请清单 */
  applications: EntityTable<Application, 'id'>
  /** S10b 起的自建 / 导入 skill */
  userSkills: EntityTable<UserSkill, 'id'>
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

/**
 * v7：新增 skillRuns（取代 settings.usedSkillIds），并**删除六张 v5 遗留表**。
 *
 * 删得起是因为 v6 的迁移已经在真实数据上验过，而且 Dexie 按版本顺序跑升级——
 * 停在 v5 的浏览器打开时会先跑完 v6 的迁移，再进到这里删表，不会丢数据。
 */
db.version(7)
  .stores({
    conversations: 'id, updatedAt',
    messages: 'id, conversationId, createdAt',
    settings: 'id',
    profile: 'id',
    growthEvents: 'id, kind, category, startDate, status, parentId',
    artifacts: 'id, kind, createdAt',
    canvasNodes: 'id',
    canvasEdges: 'id, sourceNodeId, targetNodeId, artifactId',
    skillRuns: 'id, skillName, conversationId, startedAt',
    events: null,
    tasks: null,
    activities: null,
    narrativeEdges: null,
    graphNodeMeta: null,
    reflections: null,
  })
  .upgrade(async (tx) => {
    const settings = await tx.table('settings').get('app')
    const used: string[] = Array.isArray(settings?.usedSkillIds) ? settings.usedSkillIds : []
    if (used.length > 0) {
      // 旧字段只记了"用过"，没有时间与轮数——补成一条最小运行记录，
      // 让"从未用过"这条判据在升级前后保持一致，而不是把历史清零。
      const now = Date.now()
      await tx.table('skillRuns').bulkAdd(
        used.map((skillName) => ({
          id: crypto.randomUUID(),
          skillName,
          conversationId: '',
          startedAt: now,
          finishedAt: now,
          rounds: 0,
          proposals: 0,
          status: 'done',
        })),
      )
    }
    if (settings) {
      const { usedSkillIds: _dropped, ...rest } = settings
      await tx.table('settings').put(rest)
    }
  })

/**
 * v8：新增 applications（S9 申请清单）。
 *
 * 纯加表，不需要 upgrade 回调——申请数据在此之前不存在，
 * profile.targetSchools 里的目标校也不迁过来：那是「想去哪」，
 * 申请清单是「已经在申请、材料到哪一步了」，两件事，硬迁只会造出一堆空壳。
 */
db.version(8).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
  profile: 'id',
  growthEvents: 'id, kind, category, startDate, status, parentId',
  artifacts: 'id, kind, createdAt',
  canvasNodes: 'id',
  canvasEdges: 'id, sourceNodeId, targetNodeId, artifactId',
  skillRuns: 'id, skillName, conversationId, startedAt',
  applications: 'id, schoolName, track, deadline',
})

/**
 * v9：新增 userSkills（S10b 自建 / 导入的 SKILL.md）。纯加表。
 *
 * `name` 建唯一索引：skill 名在运行时是白名单的键，重名会让"用户以为授权的是 A、
 * 实际跑的是 B"，跟 capability 重名同一类问题，必须在写入这一层就挡住。
 */
db.version(9).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
  settings: 'id',
  profile: 'id',
  growthEvents: 'id, kind, category, startDate, status, parentId',
  artifacts: 'id, kind, createdAt',
  canvasNodes: 'id',
  canvasEdges: 'id, sourceNodeId, targetNodeId, artifactId',
  skillRuns: 'id, skillName, conversationId, startedAt',
  applications: 'id, schoolName, track, deadline',
  userSkills: 'id, &name, origin, updatedAt',
})
