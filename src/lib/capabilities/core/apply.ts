import { addArtifact } from '@/lib/db/artifacts'
import { addCanvasEdge, saveCanvasNode } from '@/lib/db/canvas'
import { addGrowthEvent } from '@/lib/db/events'
import { newId } from '@/lib/db/repositories'
import { usePlanningStore } from '@/stores/planningStore'
import type {
  ProfilePatchProposal,
  Proposal,
  ProposedArtifact,
  ProposedCanvasEdge,
  ProposedGrowthEvent,
  ProposedNodeNote,
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
    default:
      // 旧提案不再可确认；ProposalCard 也不会给出确认按钮，这里是兜底
      return '这张卡片来自旧版本，已无法确认'
  }
  await usePlanningStore.getState().refresh()
  return note
}
