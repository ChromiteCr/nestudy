import { db } from './index'
import { newId } from './repositories'
import type { Activity, EventItem, GraphNodeMeta, NarrativeEdge, StudentProfile, Task } from '@/types'

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

// ---- 日程事件 ----

export async function listEvents(): Promise<EventItem[]> {
  return db.events.orderBy('date').toArray()
}

/** 今天起 N 天内的事件，按日期升序 */
export async function listUpcomingEvents(days = 60): Promise<EventItem[]> {
  const today = isoToday()
  const end = isoDateOffset(days)
  return db.events.where('date').between(today, end, true, true).sortBy('date')
}

export async function addEvent(input: Omit<EventItem, 'id' | 'createdAt'>): Promise<EventItem> {
  const event: EventItem = { ...input, id: newId(), createdAt: Date.now() }
  await db.events.add(event)
  return event
}

export async function updateEvent(id: string, patch: Partial<Omit<EventItem, 'id'>>): Promise<void> {
  await db.events.update(id, patch)
}

export async function deleteEvent(id: string): Promise<void> {
  await db.transaction('rw', db.events, db.tasks, async () => {
    // 关联任务保留但解除挂靠
    await db.tasks.where('parentEventId').equals(id).modify({ parentEventId: undefined })
    await db.events.delete(id)
  })
}

// ---- 任务 ----

export async function listTasks(): Promise<Task[]> {
  return db.tasks.orderBy('dueDate').toArray()
}

export async function listTasksDueToday(): Promise<Task[]> {
  const today = isoToday()
  return db.tasks.where('dueDate').belowOrEqual(today).and((t) => t.status === 'pending').sortBy('dueDate')
}

export async function addTask(input: Omit<Task, 'id' | 'createdAt' | 'status'> & { status?: Task['status'] }): Promise<Task> {
  const task: Task = { status: 'pending', ...input, id: newId(), createdAt: Date.now() }
  await db.tasks.add(task)
  return task
}

export async function updateTask(id: string, patch: Partial<Omit<Task, 'id'>>): Promise<void> {
  await db.tasks.update(id, patch)
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}

// ---- 活动 ----

export async function listActivities(): Promise<Activity[]> {
  const activities = await db.activities.toArray()
  // 进行中（endDate=null）排前，其余按开始日期倒序
  return activities.sort((a, b) => {
    if (!a.endDate && b.endDate) return -1
    if (a.endDate && !b.endDate) return 1
    return b.startDate.localeCompare(a.startDate)
  })
}

export async function addActivity(input: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> {
  const activity: Activity = { ...input, id: newId(), createdAt: Date.now() }
  await db.activities.add(activity)
  return activity
}

export async function updateActivity(id: string, patch: Partial<Omit<Activity, 'id'>>): Promise<void> {
  await db.activities.update(id, patch)
}

export async function deleteActivity(id: string): Promise<void> {
  await db.transaction('rw', db.activities, db.narrativeEdges, async () => {
    const nodeId = `activity:${id}`
    await db.narrativeEdges.where('sourceNodeId').equals(nodeId).delete()
    await db.narrativeEdges.where('targetNodeId').equals(nodeId).delete()
    await db.activities.delete(id)
  })
}

// ---- 叙事线（成果网络图的边） ----

export async function listNarrativeEdges(): Promise<NarrativeEdge[]> {
  return db.narrativeEdges.toArray()
}

export async function addNarrativeEdge(input: Omit<NarrativeEdge, 'id' | 'createdAt'>): Promise<NarrativeEdge> {
  const edge: NarrativeEdge = { ...input, id: newId(), createdAt: Date.now() }
  await db.narrativeEdges.add(edge)
  return edge
}

export async function updateNarrativeEdge(id: string, patch: Partial<Omit<NarrativeEdge, 'id'>>): Promise<void> {
  await db.narrativeEdges.update(id, patch)
}

export async function deleteNarrativeEdge(id: string): Promise<void> {
  await db.narrativeEdges.delete(id)
}

// ---- 星图节点元数据 ----

export async function listGraphNodeMeta(): Promise<GraphNodeMeta[]> {
  return db.graphNodeMeta.toArray()
}

export async function saveGraphNodeMeta(nodeId: string, patch: Partial<Omit<GraphNodeMeta, 'nodeId'>>): Promise<void> {
  const existing = await db.graphNodeMeta.get(nodeId)
  await db.graphNodeMeta.put({ nodeId, ...existing, ...patch })
}

// ---- 日期工具 ----

export function isoToday(): string {
  return toIsoDate(new Date())
}

export function isoDateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 距今天数（负数=已过期） */
export function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}
