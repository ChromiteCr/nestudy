import { listApplications } from '@/lib/db/applications'
import { usePlanningStore } from '@/stores/planningStore'
import {
  APPLICATION_TRACK_LABEL,
  MATERIAL_KIND_LABEL,
  type ApplicationMaterial,
  type ApplicationTrack,
  type MaterialKind,
  type MaterialStatus,
  type Proposal,
  type ProposedApplication,
} from '@/types'
import { resolveDeadline } from './deadline'
import { normalizeTimeZone } from './timezone'
import type { Capability } from '../types'

/**
 * 申请清单的读写。
 *
 * 判据里的第三类：**需要专属存储的状态**。"哪所学校、走哪一轮、材料到哪一步"
 * 不是算出来的也不是查出来的，是学生一路攒下来的，必须有地方放。
 *
 * 读的时候直接把截止日换算好一并给出——否则模型拿到 "2026-11-01" 还要再调一次
 * resolve_deadline 才知道北京时间几点，白白多一轮。
 */

const TRACKS = Object.keys(APPLICATION_TRACK_LABEL) as ApplicationTrack[]
const MATERIAL_KINDS = Object.keys(MATERIAL_KIND_LABEL) as MaterialKind[]
const MATERIAL_STATUSES: MaterialStatus[] = ['todo', 'draft', 'done']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs?.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// ---- get_applications ----

export const getApplicationsCapability: Capability = {
  name: 'get_applications',
  kind: 'read',
  label: '查看申请清单',
  summary: '读取申请清单：学校、申请轮次、截止时间（含北京时间与倒计时）、材料状态',
  owner: 'core',
  schema: {
    name: 'get_applications',
    description:
      '获取学生的申请清单：学校、申请轮次（ED/EA/RD/UCAS…）、截止时间与各项材料的进度。截止时间已经换算好北京时间和剩余天数，不用再调 resolve_deadline。要更新某一条时用返回的 id 传给 propose_application，否则会变成重复的新记录。',
    parameters: {
      type: 'object',
      properties: {
        includePast: { type: 'boolean', description: '是否包含已过截止日的申请，默认 false' },
      },
      required: [],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const includePast = args.includePast === true
    const now = Date.now()
    const all = await listApplications()

    const rows = all.map((a) => {
      const resolved = resolveDeadline({
        label: `${a.schoolName} ${a.track}`,
        date: a.deadline,
        time: a.deadlineTime,
        timeZone: a.deadlineTimeZone,
        now,
      })
      const done = a.materials.filter((m) => m.status === 'done').length
      return {
        id: a.id,
        schoolName: a.schoolName,
        track: a.track,
        trackLabel: APPLICATION_TRACK_LABEL[a.track],
        deadline: 'error' in resolved ? { error: resolved.error, raw: a.deadline } : resolved,
        materials: a.materials.map((m) => ({ ...m, kindLabel: MATERIAL_KIND_LABEL[m.kind] })),
        materialProgress: `${done}/${a.materials.length}`,
        notes: a.notes,
        eventId: a.eventId,
      }
    })

    // 换算失败的（时区或日期写坏了）一律留着——藏起来学生就永远发现不了那条是错的
    const visible = includePast ? rows : rows.filter((r) => !('past' in r.deadline) || !r.deadline.past)

    return JSON.stringify({
      total: all.length,
      shown: visible.length,
      applications: visible,
      note: all.length === 0 ? '申请清单是空的。学生说起要申哪些学校时，用 propose_application 记下来。' : undefined,
    })
  },
}

// ---- propose_application ----

interface RawMaterial {
  kind?: unknown
  label?: unknown
  status?: unknown
}

interface RawApplication {
  id?: unknown
  schoolName?: unknown
  track?: unknown
  deadline?: unknown
  deadlineTime?: unknown
  deadlineTimeZone?: unknown
  materials?: unknown
  notes?: unknown
}

function parseMaterials(value: unknown): ApplicationMaterial[] {
  if (!Array.isArray(value)) return []
  const out: ApplicationMaterial[] = []
  for (const raw of value as RawMaterial[]) {
    const kind = MATERIAL_KINDS.includes(raw.kind as MaterialKind) ? (raw.kind as MaterialKind) : null
    if (!kind) continue
    out.push({
      kind,
      label: str(raw.label) || MATERIAL_KIND_LABEL[kind],
      status: MATERIAL_STATUSES.includes(raw.status as MaterialStatus) ? (raw.status as MaterialStatus) : 'todo',
    })
  }
  return out
}

export function parseApplicationArgs(rawArgs: string): ProposedApplication[] {
  const args = JSON.parse(rawArgs) as { applications?: RawApplication[] }
  const existing = usePlanningStore.getState().applications
  const out: ProposedApplication[] = []
  for (const raw of args.applications ?? []) {
    const schoolName = str(raw.schoolName)
    const deadline = str(raw.deadline)
    // 没有学校名或没有合法截止日的，不是申请记录，是想法——丢掉，不编日期
    if (!schoolName || !ISO_DATE.test(deadline)) continue
    const time = str(raw.deadlineTime)
    const track = TRACKS.includes(raw.track as ApplicationTrack) ? (raw.track as ApplicationTrack) : 'Other'
    /**
     * 模型忘了带 id 就会变成新建，同一所学校在清单里出现两遍——申请清单一旦开始
     * 长重复行就没法用了。同校同轮次现实中不可能申两次，用它兜住：认出是已有记录
     * 就补上 id，卡片会亮出「更新已有记录」，用户在点确认之前就看得见。
     */
    const matched = existing.find(
      (a) => a.track === track && a.schoolName.trim().toLowerCase() === schoolName.toLowerCase(),
    )
    out.push({
      include: true,
      id: str(raw.id) || matched?.id,
      schoolName,
      track,
      deadline,
      // 申请截止的行业惯例就是 23:59，模型没给就按它，而不是按 00:00 把学生吓一天
      deadlineTime: /^\d{1,2}:\d{2}$/.test(time) ? time : '23:59',
      deadlineTimeZone: normalizeTimeZone(str(raw.deadlineTimeZone) || 'America/New_York'),
      materials: parseMaterials(raw.materials),
      notes: str(raw.notes),
    })
  }
  return out
}

export const proposeApplicationCapability: Capability = {
  name: 'propose_application',
  kind: 'propose',
  label: '整理出申请记录',
  summary: '提案新增/更新申请记录（学校、轮次、截止、材料状态），出确认卡',
  owner: 'core',
  schema: {
    name: 'propose_application',
    description: `把申请记录的新增或更新作为提案展示给用户确认（不会直接写入）。学生说起要申哪些学校、改了轮次、或某项材料有进展时使用。确认后会同时在画板上生成一条申请截止事项。**更新已有记录必须带上 get_applications 返回的 id**，不带 id 一律当新建。materials 是整体替换，给就要给全。轮次取值：${TRACKS.join(' / ')}。`,
    parameters: {
      type: 'object',
      properties: {
        applications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '更新已有申请时必填，来自 get_applications' },
              schoolName: { type: 'string' },
              track: { type: 'string', enum: TRACKS },
              deadline: { type: 'string', description: 'YYYY-MM-DD，学校当地日期' },
              deadlineTime: { type: 'string', description: 'HH:mm 当地时间，默认 23:59' },
              deadlineTimeZone: {
                type: 'string',
                description: 'IANA 名或 ET/PT 简写，默认 America/New_York；UCAS 用 Europe/London',
              },
              materials: {
                type: 'array',
                description: '材料清单，整体替换',
                items: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: MATERIAL_KINDS },
                    label: { type: 'string', description: '具体是哪一份，如「Why Us 补充文书 250 词」' },
                    status: { type: 'string', enum: MATERIAL_STATUSES },
                  },
                  required: ['kind'],
                },
              },
              notes: { type: 'string', description: '备注：面试安排、特殊要求等' },
            },
            required: ['schoolName', 'track', 'deadline'],
          },
        },
      },
      required: ['applications'],
    },
  },
  parse: (rawArgs) => {
    const applications = parseApplicationArgs(rawArgs)
    if (applications.length === 0) return null
    return { kind: 'application', applications, status: 'pending' } satisfies Proposal
  },
}
