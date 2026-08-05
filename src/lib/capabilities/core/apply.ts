import { addApplication, updateApplication } from '@/lib/db/applications'
import { addArtifact } from '@/lib/db/artifacts'
import { addCanvasEdge, saveCanvasNode } from '@/lib/db/canvas'
import { addGrowthEvent, updateGrowthEvent } from '@/lib/db/events'
import { resolveDeadline } from '../application'
import { newId } from '@/lib/db/repositories'
import { usePlanningStore } from '@/stores/planningStore'
import { useSkillStore } from '@/stores/skillStore'
import type {
  ProfilePatchProposal,
  Proposal,
  ProposedApplication,
  ProposedArtifact,
  ProposedCanvasEdge,
  ProposedGrowthEvent,
  ProposedNodeNote,
  ProposedSkill,
} from '@/types'

/**
 * 用户在确认卡上点「确认」后真正写库的地方。
 * 直接走 db 层批量写，最后让 store 全量重读一次——比每写一条刷一次省事，也不会写到一半状态不一致。
 */

async function applyEvents(events: ProposedGrowthEvent[]): Promise<string> {
  const included = events.filter((e) => e.include)
  // 长期先建：短期可能要挂靠到本次新建的长期事项上，那时候它还没有 id
  const longEvents = included.filter((e) => e.kind === 'long')
  const shortEvents = included.filter((e) => e.kind === 'short')

  const titleToId = new Map<string, string>()
  for (const existing of usePlanningStore.getState().growthEvents) {
    if (existing.kind === 'long') titleToId.set(existing.title, existing.id)
  }

  for (const e of longEvents) {
    const created = await addGrowthEvent({
      kind: 'long',
      title: e.title,
      category: e.category,
      startDate: e.startDate,
      endDate: e.endDate,
      status: e.endDate ? 'done' : 'ongoing',
      role: e.role,
      organization: e.organization,
      description: e.description,
      achievements: e.achievements,
      level: e.level,
      source: 'ai',
    })
    titleToId.set(created.title, created.id)
  }

  for (const e of shortEvents) {
    await addGrowthEvent({
      kind: 'short',
      title: e.title,
      category: e.category,
      startDate: e.startDate,
      endDate: null,
      status: 'pending',
      priority: e.priority,
      parentId: e.parentId ?? (e.parentTitle ? titleToId.get(e.parentTitle) : undefined),
      source: 'ai',
    })
  }

  const parts: string[] = []
  if (shortEvents.length) parts.push(`${shortEvents.length} 个短期事项`)
  if (longEvents.length) parts.push(`${longEvents.length} 个长期事项`)
  return parts.length ? `已添加 ${parts.join('、')}` : '没有勾选任何事项'
}

async function applyProfile(patch: ProfilePatchProposal): Promise<string> {
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

async function applyCanvas(edges: ProposedCanvasEdge[], notes: ProposedNodeNote[]): Promise<string> {
  let edgeCount = 0
  for (const e of edges.filter((x) => x.include && x.resolved)) {
    await addCanvasEdge({
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      label: e.reason,
      strength: e.strength,
      source: 'ai',
    })
    edgeCount++
  }
  let noteCount = 0
  for (const n of notes.filter((x) => x.include && x.resolved)) {
    await saveCanvasNode(n.nodeId, { blurb: n.blurb })
    noteCount++
  }
  const parts: string[] = []
  if (edgeCount) parts.push(`${edgeCount} 条连线`)
  if (noteCount) parts.push(`${noteCount} 处注解`)
  return parts.length ? `已写入画板：${parts.join('、')}` : '没有可写入的内容'
}

async function applyArtifacts(artifacts: ProposedArtifact[], skillName?: string, runId?: string): Promise<string> {
  let count = 0
  for (const a of artifacts.filter((x) => x.include)) {
    await addArtifact({
      kind: a.kind,
      title: a.title,
      format: a.format,
      content: a.content,
      qa: a.qa,
      skillName,
      runId,
      linkedNodeIds: a.linkedNodeIds,
      attachments: [],
      tags: a.tags,
    })
    count++
  }
  return count > 0 ? `已保存 ${count} 份学习资产` : '没有勾选任何资产'
}

/**
 * 申请提案入库。
 *
 * 每条申请同时生成一条 `category:'application'` 的短期事项——**这就是申请的界面落点**。
 * S9 不新开视图：申请是画板上的节点，倒计时在画板抽屉里，和别的 DDL 排在同一条时间线上。
 * 申请季真正的问题从来不是"申请列表长什么样"，而是"这周先干哪件"。
 */
async function applyApplications(applications: ProposedApplication[]): Promise<string> {
  const state = usePlanningStore.getState()
  const existing = new Map(state.applications.map((a) => [a.id, a]))
  const eventIds = new Set(state.growthEvents.map((e) => e.id))
  let created = 0
  let updated = 0

  for (const a of applications.filter((x) => x.include)) {
    const title = `${a.schoolName} ${a.track} 截止`
    const prior = a.id ? existing.get(a.id) : undefined

    const localDate = toLocalDeadlineDate(a)

    if (prior) {
      // 学生可能已经把那条截止事项删了——那就重建一条，而不是往一个死 id 上写
      let eventId = prior.eventId && eventIds.has(prior.eventId) ? prior.eventId : undefined
      if (eventId) await updateGrowthEvent(eventId, { title, startDate: localDate })
      else eventId = (await createDeadlineEvent(title, localDate)).id
      await updateApplication(prior.id, {
        schoolName: a.schoolName,
        track: a.track,
        deadline: a.deadline,
        deadlineTime: a.deadlineTime,
        deadlineTimeZone: a.deadlineTimeZone,
        materials: a.materials,
        notes: a.notes,
        eventId,
      })
      updated++
    } else {
      const event = await createDeadlineEvent(title, localDate)
      await addApplication({
        schoolName: a.schoolName,
        track: a.track,
        deadline: a.deadline,
        deadlineTime: a.deadlineTime,
        deadlineTimeZone: a.deadlineTimeZone,
        materials: a.materials,
        notes: a.notes,
        eventId: event.id,
      })
      created++
    }
  }

  const parts: string[] = []
  if (created) parts.push(`新增 ${created} 所`)
  if (updated) parts.push(`更新 ${updated} 所`)
  return parts.length ? `申请清单已${parts.join('、')}` : '没有勾选任何申请'
}

/**
 * 截止事项落在**北京日历的哪一天**。
 *
 * 学校写的是它当地的 11:59pm，北京要晚 12–16 小时，跨天是常态——
 * Duke ED 的 11/1 23:59 EST，学生这边其实是 11/2 中午。事项若按 11/1 记，
 * 画板抽屉的"89 天后"和申请页的"还有 90 天"就成了同一件事的两个答案。
 *
 * 锚在北京而不是浏览器本地时区：申请页那一行明写着"北京时间"，
 * 两处必须同一个口径才对得上；学生出趟国也不该让整张 DDL 表跟着挪一天。
 * 学校当地的那个时刻没有丢——它完整地存在 Application 上，申请页照原样显示。
 */
function toLocalDeadlineDate(a: ProposedApplication): string {
  const resolved = resolveDeadline({ date: a.deadline, time: a.deadlineTime, timeZone: a.deadlineTimeZone })
  return 'error' in resolved ? a.deadline : resolved.beijing.slice(0, 10)
}

function createDeadlineEvent(title: string, deadline: string) {
  return addGrowthEvent({
    kind: 'short',
    title,
    category: 'application',
    startDate: deadline,
    endDate: null,
    status: 'pending',
    priority: 'high',
    source: 'ai',
  })
}

/**
 * skill 提案入库。
 *
 * 走 skillStore 而不是直接写库：它在写完之后还要把最新一批灌回 `lib/skills` 的
 * 模块缓存，否则存进去了 agent 也看不见。校验在那里再做一遍——
 * 卡片上的解析结果是提案当时算的，用户可能在这中间又存了个同名的。
 */
async function applySkills(skills: ProposedSkill[]): Promise<string> {
  const store = useSkillStore.getState()
  const saved: string[] = []
  const failed: string[] = []

  for (const s of skills.filter((x) => x.include && x.errors.length === 0)) {
    const result = await store.saveSkill(s.text, 'created', s.replacesId)
    if (result.ok) saved.push(s.manifest?.displayName ?? s.manifest?.name ?? '未命名')
    else failed.push(`${s.manifest?.name ?? '未命名'}：${result.errors.join('；')}`)
  }

  if (saved.length === 0 && failed.length === 0) return '没有勾选任何技能'
  const parts: string[] = []
  if (saved.length) parts.push(`已保存 ${saved.join('、')}`)
  if (failed.length) parts.push(`失败：${failed.join('；')}`)
  return parts.join('；')
}

/** 提案的出处，写进 artifact 便于溯源「这份东西是哪个 skill 产出的」 */
export interface ApplyContext {
  skillName?: string
  runId?: string
}

export async function applyProposal(proposal: Proposal, context: ApplyContext = {}): Promise<string> {
  let note: string
  switch (proposal.kind) {
    case 'events':
      note = await applyEvents(proposal.events)
      break
    case 'profile':
      note = await applyProfile(proposal.patch)
      break
    case 'canvas':
      note = await applyCanvas(proposal.edges, proposal.notes)
      break
    case 'artifact':
      note = await applyArtifacts(proposal.artifacts, context.skillName, context.runId)
      break
    case 'application':
      note = await applyApplications(proposal.applications)
      break
    case 'skill':
      // 技能不属于 planning 数据，写完不必让 planningStore 全量重读
      return applySkills(proposal.skills)
    default:
      // 旧提案不再可确认；ProposalCard 也不会给出确认按钮，这里是兜底
      return '这张卡片来自旧版本，已无法确认'
  }
  await usePlanningStore.getState().refresh()
  return note
}
