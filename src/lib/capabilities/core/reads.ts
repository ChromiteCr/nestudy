import { listArtifacts } from '@/lib/db/artifacts'
import { isoToday } from '@/lib/db/dates'
import { listGrowthEvents } from '@/lib/db/events'
import { getProfile } from '@/lib/db/profile'
import { readSkillCapability } from './skills'
import type { Capability } from '../types'
import type { EventKind, GrowthEvent } from '@/types'

/**
 * 读能力。S7 及以前的 get_tasks / get_events / get_activities 三个工具
 * 对应的是同一张表的三个投影，S8 收敛成一个 get_events；get_reflections
 * 相应收敛成 get_artifacts（反思只是 artifact 的一种）。
 *
 * 每条记录都带 `nodeId`：propose_canvas 要的是稳定 id，不是标题。
 * 模型必须先从这里拿到 id 才连得上边——这就是旧版标题匹配那个脆弱点的根治办法。
 */

/** 反思正文可以很长，默认给摘要；要全文让模型指名取 */
const EXCERPT_CHARS = 300
const DEFAULT_LIMIT = 100

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs?.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function daysBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 86400000
}

function serializeEvent(e: GrowthEvent) {
  const base = {
    id: e.id,
    nodeId: `event:${e.id}`,
    kind: e.kind,
    title: e.title,
    category: e.category,
    startDate: e.startDate,
    endDate: e.endDate,
    status: e.status,
  }
  if (e.kind === 'short') {
    return { ...base, priority: e.priority, parentId: e.parentId }
  }
  return {
    ...base,
    role: e.role || undefined,
    organization: e.organization || undefined,
    description: e.description || undefined,
    achievements: e.achievements?.length ? e.achievements : undefined,
    level: e.level,
  }
}

export const getProfileCapability: Capability = {
  name: 'get_profile',
  kind: 'read',
  label: '查看档案',
  summary: '读取学生档案：年级、课程体系、在读课程、目标学校',
  owner: 'core',
  schema: {
    name: 'get_profile',
    description:
      '获取学生档案（年级、课程体系、课程列表、目标学校）。课程与目标学校都带 nodeId，可直接用于 propose_canvas。',
    parameters: { type: 'object', properties: {} },
  },
  execute: async () => {
    const p = await getProfile()
    return JSON.stringify({
      name: p.name,
      grade: p.grade,
      curriculum: p.curriculum,
      courses: p.courses.map((c) => ({
        nodeId: `course:${c.id}`,
        name: c.name,
        level: c.level,
        currentGrade: c.currentGrade,
        targetGrade: c.targetGrade,
      })),
      targetSchools: p.targetSchools.map((s) => ({
        nodeId: `school:${s.id}`,
        name: s.name,
        major: s.major,
        round: s.round,
        deadline: s.deadline,
      })),
    })
  },
}

export const getEventsCapability: Capability = {
  name: 'get_events',
  kind: 'read',
  label: '查看事项',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    if (args.kind === 'long') return '查看长期经历'
    if (args.kind === 'short') return typeof args.withinDays === 'number' ? `查看近 ${args.withinDays} 天的事项` : '查看短期事项'
    return undefined
  },
  summary: '读取全部事项：短期（任务/截止/考试）与长期（活动/项目）',
  owner: 'core',
  schema: {
    name: 'get_events',
    description:
      '获取学生的事项。短期事项 kind="short"（任务、截止日期、考试，startDate 即到期日）；长期事项 kind="long"（活动、社团、科研、实习等，endDate 为 null 表示进行中）。返回的 nodeId 可直接用于 propose_canvas，id 可用于 propose_events 的 parentId。默认只返回未完成的，要看已完成的请传 includeDone=true。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['short', 'long'], description: '只要某一类；省略则两类都返回' },
        withinDays: { type: 'number', description: '只要 startDate 在今天起 N 天内的短期事项' },
        includeDone: {
          type: 'boolean',
          description: '是否包含已完成/已归档的**短期**事项，默认 false。长期事项无论是否已结束都会返回。',
        },
        limit: { type: 'number', description: `最多返回多少条，默认 ${DEFAULT_LIMIT}` },
      },
      required: [],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const kind = args.kind === 'short' || args.kind === 'long' ? (args.kind as EventKind) : undefined
    const includeDone = args.includeDone === true
    const withinDays = typeof args.withinDays === 'number' ? args.withinDays : undefined
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 300) : DEFAULT_LIMIT
    const today = isoToday()

    let events = await listGrowthEvents()
    if (kind) events = events.filter((e) => e.kind === kind)
    // includeDone 只作用于短期事项：做完的任务确实不用再看，
    // 但长期事项的 done 表示「这段经历结束了」，那正是背景提升要读的东西，不能滤掉
    if (!includeDone) {
      events = events.filter((e) => e.kind === 'long' || (e.status !== 'done' && e.status !== 'archived'))
    }
    if (withinDays !== undefined) {
      events = events.filter((e) => {
        if (e.kind !== 'short') return true
        const diff = daysBetween(today, e.startDate)
        return diff >= 0 && diff <= withinDays
      })
    }

    return JSON.stringify({
      today,
      total: events.length,
      events: events.slice(0, limit).map(serializeEvent),
    })
  },
}

const ARTIFACT_KIND_LABEL: Record<string, string> = {
  reflection: '反思记录',
  document: '文档',
  cheatsheet: '速查表',
  plan: '学习计划',
  review: '复盘',
  essay: '文书草稿',
  code: '代码',
}

export const getArtifactsCapability: Capability = {
  name: 'get_artifacts',
  kind: 'read',
  label: '查看学习资产',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const kind = typeof args.kind === 'string' ? ARTIFACT_KIND_LABEL[args.kind] : undefined
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (query) return `在${kind ?? '学习资产'}里找「${query}」`
    return kind ? `查看${kind}` : undefined
  },
  summary: '读取学习资产：反思、文档、复盘、计划等历史产出',
  owner: 'core',
  schema: {
    name: 'get_artifacts',
    description:
      '获取学生的学习资产（反思、文档、复盘、计划、文书草稿等）。正文默认只给前 300 字摘要；需要某一条的全文时传它的 id 到 ids。linkedNodeIds 是它关联的画板节点。takeaway 是学生自己写下的「下次会怎么做」，摘要模式下也是完整原话——**引用时一个字都不要改，也不要替他补一句他没说过的**；空着说明这件事他还没消化完，那本身就是实情。',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['reflection', 'document', 'cheatsheet', 'plan', 'review', 'essay', 'code'],
          description: '只要某一类；省略则全部',
        },
        query: { type: 'string', description: '按标题/正文/标签做关键词过滤' },
        ids: { type: 'array', items: { type: 'string' }, description: '指定 id 取全文' },
        limit: { type: 'number', description: `最多返回多少条，默认 ${DEFAULT_LIMIT}` },
      },
      required: [],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const wantedIds = new Set(Array.isArray(args.ids) ? (args.ids as unknown[]).filter((v) => typeof v === 'string') : [])
    const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 200) : DEFAULT_LIMIT

    let artifacts = await listArtifacts()
    if (typeof args.kind === 'string') artifacts = artifacts.filter((a) => a.kind === args.kind)
    if (wantedIds.size > 0) artifacts = artifacts.filter((a) => wantedIds.has(a.id))
    if (query) {
      artifacts = artifacts.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.content.toLowerCase().includes(query) ||
          a.tags.some((t) => t.toLowerCase().includes(query)),
      )
    }

    return JSON.stringify({
      total: artifacts.length,
      artifacts: artifacts.slice(0, limit).map((a) => {
        const full = wantedIds.has(a.id)
        return {
          id: a.id,
          kind: a.kind,
          title: a.title,
          tags: a.tags,
          linkedNodeIds: a.linkedNodeIds,
          skillName: a.skillName,
          createdAt: new Date(a.createdAt).toISOString().slice(0, 10),
          content: full ? a.content : a.content.slice(0, EXCERPT_CHARS),
          truncated: !full && a.content.length > EXCERPT_CHARS,
          qa: full ? a.qa : undefined,
          // 摘要模式下也整句给。它只有一行，而它是这条记录里唯一"将来用得上"的一层——
          // 判断一个学生有没有在长进，看的就是这一句（招生官读档要引的证据）
          takeaway: a.takeaway,
        }
      }),
    })
  },
}

export const CORE_READ_CAPABILITIES: Capability[] = [
  readSkillCapability,
  getProfileCapability,
  getEventsCapability,
  getArtifactsCapability,
]
