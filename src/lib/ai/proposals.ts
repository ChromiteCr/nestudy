import { newId } from '@/lib/db/repositories'
import { usePlanningStore } from '@/stores/planningStore'
import { buildSphereNodes, resolveLabelToNodeId } from '@/components/graph/sphere-model'
import type {
  ActivityCategory,
  ActivityLevel,
  Curriculum,
  EventType,
  ProfilePatchProposal,
  ProposedActivity,
  ProposedEdge,
  ProposedEvent,
  ProposedTask,
  TaskPriority,
} from '@/types'

const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  'academic',
  'leadership',
  'service',
  'athletics',
  'arts',
  'work',
  'research',
  'other',
]
const ACTIVITY_LEVELS: ActivityLevel[] = ['school', 'regional', 'national', 'international']
const isoRe = /^\d{4}-\d{2}-\d{2}$/

/** 解析模型给出的 propose_import 参数为可编辑提案（宽松校验，坏行丢弃） */
export function parseImportArgs(rawArgs: string): { events: ProposedEvent[]; tasks: ProposedTask[] } {
  const args = JSON.parse(rawArgs) as {
    events?: { title?: string; type?: string; date?: string }[]
    tasks?: { title?: string; dueDate?: string; priority?: string; eventTitle?: string }[]
  }
  const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const events: ProposedEvent[] = (args.events ?? [])
    .filter((e) => e.title && isDate(e.date))
    .map((e) => ({
      include: true,
      title: e.title!,
      type: (['exam', 'deadline', 'activity'].includes(e.type ?? '') ? e.type : 'deadline') as EventType,
      date: e.date!,
    }))
  const tasks: ProposedTask[] = (args.tasks ?? [])
    .filter((t) => t.title && isDate(t.dueDate))
    .map((t) => ({
      include: true,
      title: t.title!,
      dueDate: t.dueDate!,
      priority: (['high', 'medium', 'low'].includes(t.priority ?? '') ? t.priority : 'medium') as TaskPriority,
      eventTitle: t.eventTitle,
    }))
  return { events, tasks }
}

export function parseProfileArgs(rawArgs: string): ProfilePatchProposal {
  const args = JSON.parse(rawArgs) as ProfilePatchProposal
  const patch: ProfilePatchProposal = {}
  if (typeof args.name === 'string' && args.name.trim()) patch.name = args.name.trim()
  if (typeof args.grade === 'number') patch.grade = args.grade
  if (args.curriculum && ['IB', 'AP', 'ALevel', 'Other'].includes(args.curriculum)) {
    patch.curriculum = args.curriculum as Curriculum
  }
  if (Array.isArray(args.courses)) {
    patch.courses = args.courses
      .filter((c) => c?.name)
      .map((c) => ({
        name: c.name,
        level: c.level ?? 'Standard',
        currentGrade: c.currentGrade ?? '',
        targetGrade: c.targetGrade ?? '',
      }))
  }
  if (Array.isArray(args.targetSchools)) {
    patch.targetSchools = args.targetSchools
      .filter((s) => s?.name)
      .map((s) => ({
        name: s.name,
        major: s.major ?? '',
        round: s.round && ['ED', 'EA', 'RD', 'Other'].includes(s.round) ? s.round : 'Other',
        deadline: s.deadline ?? null,
      }))
  }
  return patch
}

/** 用户确认导入提案：先建事件（标题→id 映射），再建任务并解析关联 */
export async function applyImportProposal(events: ProposedEvent[], tasks: ProposedTask[]): Promise<string> {
  const store = usePlanningStore.getState()
  const titleToId = new Map<string, string>()
  for (const existing of store.events) titleToId.set(existing.title, existing.id)

  let eventCount = 0
  for (const e of events.filter((x) => x.include)) {
    await store.createEvent({ title: e.title, type: e.type, date: e.date, source: 'import' })
    eventCount++
  }
  // 重新读取拿到新建事件的 id
  for (const existing of usePlanningStore.getState().events) titleToId.set(existing.title, existing.id)

  let taskCount = 0
  for (const t of tasks.filter((x) => x.include)) {
    await store.createTask({
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      parentEventId: t.eventTitle ? titleToId.get(t.eventTitle) : undefined,
      source: 'import',
    })
    taskCount++
  }
  return `已导入 ${eventCount} 个事件、${taskCount} 条任务`
}

/** 用户确认档案提案：合并写入（课程/目标校为整体替换若提供） */
export async function applyProfileProposal(patch: ProfilePatchProposal): Promise<string> {
  const store = usePlanningStore.getState()
  const parts: string[] = []
  const update: Parameters<typeof store.updateProfile>[0] = {}
  if (patch.name !== undefined) {
    update.name = patch.name
    parts.push(`名字 ${patch.name}`)
  }
  if (patch.grade !== undefined) {
    update.grade = patch.grade
    parts.push(`年级 ${patch.grade}`)
  }
  if (patch.curriculum !== undefined) {
    update.curriculum = patch.curriculum
    parts.push(`体系 ${patch.curriculum}`)
  }
  if (patch.courses) {
    update.courses = patch.courses.map((c) => ({ ...c, id: newId() }))
    parts.push(`${patch.courses.length} 门课程`)
  }
  if (patch.targetSchools) {
    update.targetSchools = patch.targetSchools.map((s) => ({ ...s, deadline: s.deadline ?? null, id: newId() }))
    parts.push(`${patch.targetSchools.length} 所目标校`)
  }
  await store.updateProfile(update)
  return `已更新档案：${parts.join('、')}`
}

/** 解析 propose_activities 参数为可编辑提案 */
export function parseActivitiesArgs(rawArgs: string): ProposedActivity[] {
  const args = JSON.parse(rawArgs) as {
    activities?: {
      title?: string
      category?: string
      role?: string
      organization?: string
      startDate?: string
      endDate?: string
      description?: string
      achievements?: string[]
      level?: string
    }[]
  }
  return (args.activities ?? [])
    .filter((a) => a.title?.trim())
    .map((a) => ({
      include: true,
      title: a.title!.trim(),
      category: (ACTIVITY_CATEGORIES.includes(a.category as ActivityCategory)
        ? a.category
        : 'other') as ActivityCategory,
      role: a.role ?? '',
      organization: a.organization ?? '',
      startDate: a.startDate && isoRe.test(a.startDate) ? a.startDate : '',
      endDate: a.endDate && isoRe.test(a.endDate) ? a.endDate : null,
      description: a.description ?? '',
      achievements: Array.isArray(a.achievements) ? a.achievements.filter((s) => typeof s === 'string') : [],
      level: (ACTIVITY_LEVELS.includes(a.level as ActivityLevel) ? a.level : 'school') as ActivityLevel,
    }))
}

/** 用户确认活动提案：逐条写入活动档案 */
export async function applyActivitiesProposal(activities: ProposedActivity[]): Promise<string> {
  const store = usePlanningStore.getState()
  let count = 0
  for (const a of activities.filter((x) => x.include)) {
    await store.createActivity({
      title: a.title,
      category: a.category,
      role: a.role,
      organization: a.organization,
      startDate: a.startDate,
      endDate: a.endDate,
      description: a.description,
      achievements: a.achievements,
      level: a.level,
      source: 'ai',
    })
    count++
  }
  return `已添加 ${count} 个活动`
}

/** 解析 propose_narrative 参数为可编辑提案（按当前节点标题解析到 node id，解析失败的标红不可入库） */
export function parseNarrativeArgs(rawArgs: string): ProposedEdge[] {
  const args = JSON.parse(rawArgs) as {
    edges?: { source?: string; target?: string; reason?: string }[]
  }
  const { activities, profile } = usePlanningStore.getState()
  const nodes = buildSphereNodes(activities, profile)
  return (args.edges ?? [])
    .filter((e) => e.source?.trim() && e.target?.trim())
    .map((e) => ({
      include: true,
      sourceLabel: e.source!.trim(),
      targetLabel: e.target!.trim(),
      reason: e.reason ?? '',
      sourceNodeId: resolveLabelToNodeId(e.source!, nodes),
      targetNodeId: resolveLabelToNodeId(e.target!, nodes),
    }))
}

/** 用户确认叙事线提案：写入可解析且不自连的边 */
export async function applyNarrativeProposal(edges: ProposedEdge[]): Promise<string> {
  const store = usePlanningStore.getState()
  let count = 0
  for (const e of edges.filter((x) => x.include && x.sourceNodeId && x.targetNodeId)) {
    if (e.sourceNodeId === e.targetNodeId) continue
    await store.createEdge({
      sourceNodeId: e.sourceNodeId!,
      targetNodeId: e.targetNodeId!,
      label: e.reason,
      source: 'ai',
    })
    count++
  }
  return `已连接 ${count} 条叙事线`
}
