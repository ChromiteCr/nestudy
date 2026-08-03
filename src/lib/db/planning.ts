import { db } from './index'
import { addArtifact, deleteArtifact, listArtifactsByKind, updateArtifact } from './artifacts'
import {
  addCanvasEdge,
  deleteCanvasEdge,
  listCanvasEdges,
  updateCanvasEdge,
} from './canvas'
import {
  addGrowthEvent,
  deleteGrowthEvent,
  listGrowthEvents,
  updateGrowthEvent,
} from './events'
import { isoToday } from './dates'
import type {
  Activity,
  Artifact,
  CanvasEdge,
  EventItem,
  GraphNodeMeta,
  GrowthEvent,
  NarrativeEdge,
  Reflection,
  ShortEventCategory,
  StudentProfile,
  Task,
} from '@/types'

export { daysUntil, isoDateOffset, isoToday, toIsoDate } from './dates'

const PROFILE_ID = 'app'

// ---- 档案 ----

export async function getProfile(): Promise<StudentProfile> {
  const existing = await db.profile.get(PROFILE_ID)
  // name 为 S2a2 新增字段，旧记录补默认值
  if (existing) return { ...existing, name: existing.name ?? '' }
  const fresh: StudentProfile = {
    id: PROFILE_ID,
    name: '',
    grade: null,
    curriculum: null,
    courses: [],
    targetSchools: [],
  }
  await db.profile.put(fresh)
  return fresh
}

export async function saveProfile(patch: Partial<Omit<StudentProfile, 'id'>>): Promise<StudentProfile> {
  const current = await getProfile()
  const next = { ...current, ...patch }
  await db.profile.put(next)
  return next
}

// ============================================================================
// 以下为 S6 兼容层：把统一后的 growthEvents / artifacts / canvasEdges 投影回
// S5 的 Task / EventItem / Activity / Reflection / NarrativeEdge 形状，
// 让旧视图在数据层重构期间零改动继续运行。**S7 换脸时整段删除。**
// ============================================================================

// ---- 事项 ↔ 旧形状 ----

function toTask(e: GrowthEvent): Task {
  return {
    id: e.id,
    title: e.title,
    dueDate: e.startDate,
    priority: e.priority ?? 'medium',
    status: e.status === 'done' ? 'completed' : 'pending',
    parentEventId: e.parentId,
    source: e.source,
    createdAt: e.createdAt,
  }
}

function toEventItem(e: GrowthEvent): EventItem {
  return {
    id: e.id,
    title: e.title,
    // 旧 EventType 只有三种；'other' 当年就是由 'activity' 迁过来的，原样投回去
    type: e.category === 'exam' ? 'exam' : e.category === 'other' ? 'activity' : 'deadline',
    date: e.startDate,
    source: e.source,
    createdAt: e.createdAt,
  }
}

function toActivity(e: GrowthEvent): Activity {
  return {
    id: e.id,
    title: e.title,
    category: (e.category as Activity['category']) ?? 'other',
    role: e.role ?? '',
    organization: e.organization ?? '',
    startDate: e.startDate,
    endDate: e.endDate,
    description: e.description ?? '',
    achievements: e.achievements ?? [],
    level: e.level ?? 'school',
    source: e.source,
    createdAt: e.createdAt,
  }
}

const isTaskEvent = (e: GrowthEvent) => e.kind === 'short' && e.category === 'task'
const isScheduleEvent = (e: GrowthEvent) => e.kind === 'short' && e.category !== 'task'

// ---- 日程事件 ----

export async function listEvents(): Promise<EventItem[]> {
  const events = await listGrowthEvents()
  return events.filter(isScheduleEvent).map(toEventItem)
}

/** 今天起 N 天内的事件，按日期升序 */
export async function listUpcomingEvents(days = 60): Promise<EventItem[]> {
  const today = isoToday()
  const all = await listEvents()
  return all.filter((e) => e.date >= today).filter((e) => {
    const diff = (new Date(e.date).getTime() - new Date(today).getTime()) / 86400000
    return diff <= days
  })
}

export async function addEvent(input: Omit<EventItem, 'id' | 'createdAt'>): Promise<EventItem> {
  const category: ShortEventCategory = input.type === 'activity' ? 'other' : input.type
  const created = await addGrowthEvent({
    kind: 'short',
    title: input.title,
    category,
    startDate: input.date,
    endDate: null,
    status: 'pending',
    source: input.source,
  })
  return toEventItem(created)
}

export async function updateEvent(id: string, patch: Partial<Omit<EventItem, 'id'>>): Promise<void> {
  const next: Partial<Omit<GrowthEvent, 'id'>> = {}
  if (patch.title !== undefined) next.title = patch.title
  if (patch.date !== undefined) next.startDate = patch.date
  if (patch.source !== undefined) next.source = patch.source
  if (patch.type !== undefined) next.category = patch.type === 'activity' ? 'other' : patch.type
  await updateGrowthEvent(id, next)
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteGrowthEvent(id)
}

// ---- 任务 ----

export async function listTasks(): Promise<Task[]> {
  const events = await listGrowthEvents()
  return events.filter(isTaskEvent).map(toTask)
}

export async function listTasksDueToday(): Promise<Task[]> {
  const today = isoToday()
  const tasks = await listTasks()
  return tasks.filter((t) => t.status === 'pending' && t.dueDate <= today)
}

export async function addTask(
  input: Omit<Task, 'id' | 'createdAt' | 'status'> & { status?: Task['status'] },
): Promise<Task> {
  const created = await addGrowthEvent({
    kind: 'short',
    title: input.title,
    category: 'task',
    startDate: input.dueDate,
    endDate: null,
    status: input.status === 'completed' ? 'done' : 'pending',
    priority: input.priority,
    parentId: input.parentEventId,
    source: input.source,
  })
  return toTask(created)
}

export async function updateTask(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<void> {
  const next: Partial<Omit<GrowthEvent, 'id'>> = {}
  if (patch.title !== undefined) next.title = patch.title
  if (patch.dueDate !== undefined) next.startDate = patch.dueDate
  if (patch.priority !== undefined) next.priority = patch.priority
  if (patch.status !== undefined) next.status = patch.status === 'completed' ? 'done' : 'pending'
  if (patch.parentEventId !== undefined) next.parentId = patch.parentEventId
  if (patch.source !== undefined) next.source = patch.source
  await updateGrowthEvent(id, next)
}

export async function deleteTask(id: string): Promise<void> {
  await deleteGrowthEvent(id)
}

// ---- 活动 ----

export async function listActivities(): Promise<Activity[]> {
  const events = await listGrowthEvents()
  const long = events.filter((e) => e.kind === 'long').map(toActivity)
  return long.sort((a, b) => {
    if (!a.endDate && b.endDate) return -1
    if (a.endDate && !b.endDate) return 1
    return b.startDate.localeCompare(a.startDate)
  })
}

export async function addActivity(input: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
  const created = await addGrowthEvent({
    kind: 'long',
    title: input.title,
    category: input.category,
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.endDate ? 'done' : 'ongoing',
    role: input.role,
    organization: input.organization,
    description: input.description,
    achievements: input.achievements,
    level: input.level,
    source: input.source,
  })
  return toActivity(created)
}

export async function updateActivity(id: string, patch: Partial<Omit<Activity, 'id'>>): Promise<void> {
  const next: Partial<Omit<GrowthEvent, 'id'>> = {}
  if (patch.title !== undefined) next.title = patch.title
  if (patch.category !== undefined) next.category = patch.category
  if (patch.startDate !== undefined) next.startDate = patch.startDate
  if (patch.endDate !== undefined) {
    next.endDate = patch.endDate
    next.status = patch.endDate ? 'done' : 'ongoing'
  }
  if (patch.role !== undefined) next.role = patch.role
  if (patch.organization !== undefined) next.organization = patch.organization
  if (patch.description !== undefined) next.description = patch.description
  if (patch.achievements !== undefined) next.achievements = patch.achievements
  if (patch.level !== undefined) next.level = patch.level
  if (patch.source !== undefined) next.source = patch.source
  await updateGrowthEvent(id, next)
}

export async function deleteActivity(id: string): Promise<void> {
  await deleteGrowthEvent(id)
}

// ---- 叙事线 → 画板的边 ----

function toNarrativeEdge(e: CanvasEdge): NarrativeEdge {
  return {
    id: e.id,
    sourceNodeId: e.sourceNodeId,
    targetNodeId: e.targetNodeId,
    label: e.label,
    strength: e.strength,
    source: e.source,
    createdAt: e.createdAt,
  }
}

export async function listNarrativeEdges(): Promise<NarrativeEdge[]> {
  const edges = await listCanvasEdges()
  return edges.map(toNarrativeEdge)
}

export async function addNarrativeEdge(input: Omit<NarrativeEdge, 'id' | 'createdAt'>): Promise<NarrativeEdge> {
  return toNarrativeEdge(await addCanvasEdge(input))
}

export async function updateNarrativeEdge(id: string, patch: Partial<Omit<NarrativeEdge, 'id'>>): Promise<void> {
  await updateCanvasEdge(id, patch)
}

export async function deleteNarrativeEdge(id: string): Promise<void> {
  await deleteCanvasEdge(id)
}

// ---- 星图节点元数据 ----
// shell / pinned 是 3D 星图独有的分层概念，新的 CanvasNode 不建模它们。
// S6 期间这两个字段继续读写遗留的 graphNodeMeta 表（v7 随 3D 星图一起删）。

export async function listGraphNodeMeta(): Promise<GraphNodeMeta[]> {
  return db.graphNodeMeta.toArray()
}

export async function saveGraphNodeMeta(
  nodeId: string,
  patch: Partial<Omit<GraphNodeMeta, 'nodeId'>>,
): Promise<void> {
  const existing = await db.graphNodeMeta.get(nodeId)
  await db.graphNodeMeta.put({ ...existing, ...patch, nodeId })
}

// ---- 反思 → 资产 ----

function toReflection(a: Artifact): Reflection {
  const activityNode = a.linkedNodeIds.find((n) => n.startsWith('event:'))
  return {
    id: a.id,
    title: a.title,
    // Artifact 不再区分触发来源；有关联事项即视为「关联活动」，否则「自由记录」
    trigger: activityNode ? 'activity' : 'freeform',
    activityId: activityNode?.slice('event:'.length),
    qa: a.qa ?? [],
    summary: a.content,
    attachments: a.attachments,
    source: 'ai',
    createdAt: a.createdAt,
  }
}

export async function listReflections(): Promise<Reflection[]> {
  const artifacts = await listArtifactsByKind('reflection')
  return artifacts.map(toReflection)
}

export async function addReflection(input: Omit<Reflection, 'id' | 'createdAt'>): Promise<Reflection> {
  const created = await addArtifact({
    kind: 'reflection',
    title: input.title,
    format: 'markdown',
    content: input.summary,
    qa: input.qa,
    linkedNodeIds: input.activityId ? [`event:${input.activityId}`] : [],
    attachments: input.attachments,
    tags: [],
  })
  return toReflection(created)
}

export async function updateReflection(id: string, patch: Partial<Omit<Reflection, 'id'>>): Promise<void> {
  const next: Partial<Omit<Artifact, 'id'>> = {}
  if (patch.title !== undefined) next.title = patch.title
  if (patch.summary !== undefined) next.content = patch.summary
  if (patch.qa !== undefined) next.qa = patch.qa
  if (patch.attachments !== undefined) next.attachments = patch.attachments
  if (patch.activityId !== undefined) {
    next.linkedNodeIds = patch.activityId ? [`event:${patch.activityId}`] : []
  }
  await updateArtifact(id, next)
}

export async function deleteReflection(id: string): Promise<void> {
  await deleteArtifact(id)
}
