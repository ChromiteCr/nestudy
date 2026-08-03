import { listNodeLabels } from '@/components/canvas/canvas-model'
import { usePlanningStore } from '@/stores/planningStore'
import {
  ACTIVITY_LEVEL_LABEL,
  EVENT_CATEGORY_LABEL,
  type ActivityLevel,
  type ArtifactFormat,
  type ArtifactKind,
  type Curriculum,
  type EventCategory,
  type EventKind,
  type ProfilePatchProposal,
  type Proposal,
  type ProposedArtifact,
  type ProposedCanvasEdge,
  type ProposedGrowthEvent,
  type ProposedNodeNote,
  type ReflectionQA,
  type TaskPriority,
} from '@/types'
import type { Capability } from '../types'

/**
 * 提案能力。四个 propose_* 全部**不写库**——解析成提案，渲染确认卡，
 * 用户点确认后才由 apply.ts 写入。这条从 S2 至今没变过，换成 skill 也不变。
 *
 * 解析一律宽松：坏行丢弃、缺字段补默认，不因为模型少给一个字段就整卡失败。
 * 但**节点 id 不宽松**——解析不到的边标红且不可勾选，宁可让用户看见一条连不上的边，
 * 也不要像旧版那样静默丢掉。
 */

const EVENT_CATEGORIES = Object.keys(EVENT_CATEGORY_LABEL) as EventCategory[]
const ACTIVITY_LEVELS = Object.keys(ACTIVITY_LEVEL_LABEL) as ActivityLevel[]
const ARTIFACT_KINDS: ArtifactKind[] = ['reflection', 'document', 'cheatsheet', 'plan', 'review', 'essay', 'code']
const ARTIFACT_FORMATS: ArtifactFormat[] = ['markdown', 'latex', 'json', 'text']
const PRIORITIES: TaskPriority[] = ['high', 'medium', 'low']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : []
}

function isoDate(value: unknown): string | null {
  const s = str(value)
  return ISO_DATE.test(s) ? s : null
}

function clampStrength(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(5, Math.max(1, Math.round(value))) : 3
}

// ---- propose_events ----

interface RawEvent {
  kind?: unknown
  title?: unknown
  category?: unknown
  startDate?: unknown
  endDate?: unknown
  priority?: unknown
  parentId?: unknown
  parentTitle?: unknown
  role?: unknown
  organization?: unknown
  description?: unknown
  achievements?: unknown
  level?: unknown
}

export function parseEventsArgs(rawArgs: string): ProposedGrowthEvent[] {
  const args = JSON.parse(rawArgs) as { events?: RawEvent[] }
  const out: ProposedGrowthEvent[] = []
  for (const raw of args.events ?? []) {
    const title = str(raw.title)
    if (!title) continue
    const kind: EventKind = raw.kind === 'long' ? 'long' : 'short'
    const category = EVENT_CATEGORIES.includes(raw.category as EventCategory)
      ? (raw.category as EventCategory)
      : kind === 'long'
        ? 'other'
        : 'task'
    const startDate = isoDate(raw.startDate)
    // 短期事项没有日期就不是事项，是想法——丢掉，不编日期
    if (kind === 'short' && !startDate) continue

    const event: ProposedGrowthEvent = {
      include: true,
      kind,
      title,
      category,
      startDate: startDate ?? '',
      endDate: kind === 'long' ? isoDate(raw.endDate) : null,
    }
    if (kind === 'short') {
      event.priority = PRIORITIES.includes(raw.priority as TaskPriority) ? (raw.priority as TaskPriority) : 'medium'
      const parentId = str(raw.parentId)
      const parentTitle = str(raw.parentTitle)
      if (parentId) event.parentId = parentId
      else if (parentTitle) event.parentTitle = parentTitle
    } else {
      event.role = str(raw.role)
      event.organization = str(raw.organization)
      event.description = str(raw.description)
      event.achievements = strList(raw.achievements)
      event.level = ACTIVITY_LEVELS.includes(raw.level as ActivityLevel) ? (raw.level as ActivityLevel) : 'school'
    }
    out.push(event)
  }
  return out
}

export const proposeEventsCapability: Capability = {
  name: 'propose_events',
  kind: 'propose',
  summary: '提案新增事项（任务 / 截止 / 考试 / 活动 / 项目），出确认卡',
  owner: 'core',
  schema: {
    name: 'propose_events',
    description: `把要新增的事项作为提案展示给用户确认（不会直接写入）。短期事项 kind="short"（任务、截止日期、考试；startDate 就是到期日，必填且必须是 YYYY-MM-DD，没有明确日期就不要提案这一条）；长期事项 kind="long"（活动、社团、科研、实习、长期项目；startDate 是开始日，endDate 省略表示进行中）。用户粘贴通知/邮件、要求安排任务与日程、或描述自己参加过的活动经历时使用。类别取值：${EVENT_CATEGORIES.join(' / ')}。`,
    parameters: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['short', 'long'] },
              title: { type: 'string' },
              category: { type: 'string', enum: EVENT_CATEGORIES },
              startDate: { type: 'string', description: 'YYYY-MM-DD' },
              endDate: { type: 'string', description: 'YYYY-MM-DD；长期事项进行中则省略' },
              priority: { type: 'string', enum: PRIORITIES, description: '短期专属' },
              parentId: {
                type: 'string',
                description: '短期专属：挂靠到已存在的长期事项，用 get_events 返回的 id',
              },
              parentTitle: {
                type: 'string',
                description: '短期专属：挂靠到本次提案里新建的长期事项，写它的 title',
              },
              role: { type: 'string', description: '长期专属：担任的角色' },
              organization: { type: 'string', description: '长期专属：所属组织/机构' },
              description: { type: 'string', description: '长期专属：一句话描述做了什么' },
              achievements: { type: 'array', items: { type: 'string' }, description: '长期专属：成果/奖项' },
              level: { type: 'string', enum: ACTIVITY_LEVELS, description: '长期专属：级别' },
            },
            required: ['kind', 'title', 'category'],
          },
        },
      },
      required: ['events'],
    },
  },
  parse: (rawArgs) => {
    const events = parseEventsArgs(rawArgs)
    if (events.length === 0) return null
    return { kind: 'events', events, status: 'pending' } satisfies Proposal
  },
}

// ---- propose_profile_update ----

export function parseProfileArgs(rawArgs: string): ProfilePatchProposal {
  const args = JSON.parse(rawArgs) as ProfilePatchProposal
  const patch: ProfilePatchProposal = {}
  if (str(args.name)) patch.name = str(args.name)
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

export const proposeProfileCapability: Capability = {
  name: 'propose_profile_update',
  kind: 'propose',
  summary: '提案更新学生档案（年级 / 体系 / 课程 / 目标校），出确认卡',
  owner: 'core',
  schema: {
    name: 'propose_profile_update',
    description:
      '把档案更新（年级/课程体系/课程/目标学校）作为提案展示给用户确认（不会直接写入）。建档采访或用户提供档案信息时使用。courses 与 targetSchools 是整体替换，给就要给全。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '学生名字/昵称' },
        grade: { type: 'number', description: '年级（9-12）' },
        curriculum: { type: 'string', enum: ['IB', 'AP', 'ALevel', 'Other'] },
        courses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              level: { type: 'string', description: 'HL/SL/AP/Standard 等' },
              currentGrade: { type: 'string' },
              targetGrade: { type: 'string' },
            },
            required: ['name', 'level'],
          },
        },
        targetSchools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              major: { type: 'string' },
              round: { type: 'string', enum: ['ED', 'EA', 'RD', 'Other'] },
              deadline: { type: 'string', description: 'YYYY-MM-DD，可省略' },
            },
            required: ['name'],
          },
        },
      },
      required: [],
    },
  },
  parse: (rawArgs) => {
    const patch = parseProfileArgs(rawArgs)
    if (Object.keys(patch).length === 0) return null
    return { kind: 'profile', patch, status: 'pending' } satisfies Proposal
  },
}

// ---- propose_canvas ----

interface RawEdge {
  sourceNodeId?: unknown
  targetNodeId?: unknown
  reason?: unknown
  strength?: unknown
}
interface RawNote {
  nodeId?: unknown
  blurb?: unknown
}

export function parseCanvasArgs(rawArgs: string): { edges: ProposedCanvasEdge[]; notes: ProposedNodeNote[] } {
  const args = JSON.parse(rawArgs) as { edges?: RawEdge[]; notes?: RawNote[] }
  const { growthEvents, profile } = usePlanningStore.getState()
  const labels = new Map(listNodeLabels(growthEvents, profile).map((n) => [n.id, n.label]))

  const edges: ProposedCanvasEdge[] = []
  for (const raw of args.edges ?? []) {
    const sourceNodeId = str(raw.sourceNodeId)
    const targetNodeId = str(raw.targetNodeId)
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) continue
    const sourceLabel = labels.get(sourceNodeId)
    const targetLabel = labels.get(targetNodeId)
    edges.push({
      include: true,
      sourceNodeId,
      targetNodeId,
      sourceLabel: sourceLabel ?? sourceNodeId,
      targetLabel: targetLabel ?? targetNodeId,
      reason: str(raw.reason),
      strength: clampStrength(raw.strength),
      resolved: sourceLabel !== undefined && targetLabel !== undefined,
    })
  }

  const notes: ProposedNodeNote[] = []
  for (const raw of args.notes ?? []) {
    const nodeId = str(raw.nodeId)
    const blurb = str(raw.blurb)
    if (!nodeId || !blurb) continue
    const label = labels.get(nodeId)
    notes.push({ include: true, nodeId, label: label ?? nodeId, blurb, resolved: label !== undefined })
  }

  return { edges, notes }
}

export const proposeCanvasCapability: Capability = {
  name: 'propose_canvas',
  kind: 'propose',
  summary: '提案画板上的连线与节点注解，出确认卡',
  owner: 'core',
  schema: {
    name: 'propose_canvas',
    description:
      '把成长画板上的连线（两件事之间为什么有关）和节点注解作为提案展示给用户确认（不会直接写入）。用户要求梳理成长/申请故事、分析经历之间的逻辑关联时使用。**必须先调用 get_events / get_profile 拿到 nodeId**，sourceNodeId/targetNodeId/nodeId 只能填那里返回的 nodeId（形如 event:xxx、school:xxx、course:xxx），不要填标题，填错的连线会被标记为无法连接。',
    parameters: {
      type: 'object',
      properties: {
        edges: {
          type: 'array',
          description: '连线：两个节点之间的叙事关系',
          items: {
            type: 'object',
            properties: {
              sourceNodeId: { type: 'string', description: '起点 nodeId（get_events / get_profile 返回的）' },
              targetNodeId: { type: 'string', description: '终点 nodeId' },
              reason: { type: 'string', description: '为什么连——这条线的逻辑，会显示在画板上' },
              strength: { type: 'number', description: '连接强度 1-5，越核心越大（决定线的粗细）' },
            },
            required: ['sourceNodeId', 'targetNodeId', 'reason'],
          },
        },
        notes: {
          type: 'array',
          description: '节点注解：给某个节点补一句话定位，显示在它的卡片上',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string' },
              blurb: { type: 'string', description: '一句话，不超过 30 字' },
            },
            required: ['nodeId', 'blurb'],
          },
        },
      },
      required: [],
    },
  },
  parse: (rawArgs) => {
    const { edges, notes } = parseCanvasArgs(rawArgs)
    if (edges.length === 0 && notes.length === 0) return null
    return { kind: 'canvas', edges, notes, status: 'pending' } satisfies Proposal
  },
}

// ---- propose_artifact ----

interface RawArtifact {
  kind?: unknown
  title?: unknown
  format?: unknown
  content?: unknown
  tags?: unknown
  linkedNodeIds?: unknown
  qa?: unknown
}

export function parseArtifactArgs(rawArgs: string): ProposedArtifact[] {
  const args = JSON.parse(rawArgs) as { artifacts?: RawArtifact[] }
  const out: ProposedArtifact[] = []
  for (const raw of args.artifacts ?? []) {
    const title = str(raw.title)
    const content = str(raw.content)
    if (!title || !content) continue
    const qa: ReflectionQA[] = Array.isArray(raw.qa)
      ? (raw.qa as { question?: unknown; answer?: unknown }[])
          .map((item) => ({ question: str(item?.question), answer: str(item?.answer) }))
          .filter((item) => item.question && item.answer)
      : []
    out.push({
      include: true,
      kind: ARTIFACT_KINDS.includes(raw.kind as ArtifactKind) ? (raw.kind as ArtifactKind) : 'document',
      title,
      format: ARTIFACT_FORMATS.includes(raw.format as ArtifactFormat) ? (raw.format as ArtifactFormat) : 'markdown',
      content,
      tags: strList(raw.tags),
      linkedNodeIds: strList(raw.linkedNodeIds),
      qa: qa.length > 0 ? qa : undefined,
    })
  }
  return out
}

export const proposeArtifactCapability: Capability = {
  name: 'propose_artifact',
  kind: 'propose',
  summary: '提案保存学习资产（反思 / 文档 / 复盘 / 计划），出确认卡',
  owner: 'core',
  schema: {
    name: 'propose_artifact',
    description:
      '把要保存的学习资产作为提案展示给用户确认（不会直接写入）。反思访谈结束、产出周复盘/学习计划/速查表等需要留存的长文时使用。**只保存学生自己说出来的内容与你的整理，不要代写应由学生本人产出的内容**。反思用 kind="reflection" 并把访谈问答填进 qa，正文写学生自己的话，不要替他总结成漂亮的成长故事。linkedNodeIds 用 get_events / get_profile 返回的 nodeId。',
    parameters: {
      type: 'object',
      properties: {
        artifacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ARTIFACT_KINDS },
              title: { type: 'string' },
              format: { type: 'string', enum: ARTIFACT_FORMATS, description: '默认 markdown' },
              content: { type: 'string', description: '正文' },
              tags: { type: 'array', items: { type: 'string' }, description: '便于日后检索（文书素材库用）' },
              linkedNodeIds: { type: 'array', items: { type: 'string' }, description: '关联的画板节点 nodeId' },
              qa: {
                type: 'array',
                description: '反思专属：访谈的问答对，原样保留不要压成纯文本',
                items: {
                  type: 'object',
                  properties: { question: { type: 'string' }, answer: { type: 'string' } },
                  required: ['question', 'answer'],
                },
              },
            },
            required: ['kind', 'title', 'content'],
          },
        },
      },
      required: ['artifacts'],
    },
  },
  parse: (rawArgs) => {
    const artifacts = parseArtifactArgs(rawArgs)
    if (artifacts.length === 0) return null
    return { kind: 'artifact', artifacts, status: 'pending' } satisfies Proposal
  },
}

export const CORE_PROPOSE_CAPABILITIES: Capability[] = [
  proposeEventsCapability,
  proposeProfileCapability,
  proposeCanvasCapability,
  proposeArtifactCapability,
]
