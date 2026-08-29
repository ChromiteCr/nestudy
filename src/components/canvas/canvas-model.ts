import type { Artifact, CanvasEdge, CanvasNode, EventCategory, GrowthEvent, StudentProfile } from '@/types'

/** 画板节点的业务数据（xyflow 的 Node.data） */
export interface CanvasNodeData extends Record<string, unknown> {
  label: string
  /** 节点类别决定配色；school/course 是锚点，走无彩 */
  tone: 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'anchor' | 'quiet'
  meta?: string
  blurb?: string
  kind: 'event' | 'school' | 'course'
}

/**
 * 类别 → 配色。6 个色相取在同一 L/C 上，所以哪一类都不会因为颜色显得更重要；
 * 目标校与课程是叙事的锚点而非主体，保持无彩。
 */
const CATEGORY_TONE: Record<EventCategory, CanvasNodeData['tone']> = {
  task: 'c1',
  deadline: 'c2',
  exam: 'c2',
  application: 'c2',
  academic: 'c3',
  research: 'c3',
  leadership: 'c4',
  work: 'c4',
  service: 'c5',
  other: 'c5',
  athletics: 'c6',
  arts: 'c6',
}

export function toneFor(category: EventCategory): CanvasNodeData['tone'] {
  return CATEGORY_TONE[category] ?? 'c5'
}

/**
 * tone → 色条 class。和 `CATEGORY_TONE`、`toneFor` 是同一件事的三段，摆在一起。
 *
 * **画板与时间线共用这一份，不许各自复制一套。** 上面那句「6 个色相取在同一 L/C 上，
 * 哪一类都不会因为颜色显得更重要」是靠共用这份映射兑现的，不是靠注释——
 * 一旦有第二套色表，那条设计就只剩一句话。
 */
export const TONE_BAR: Record<CanvasNodeData['tone'], string> = {
  c1: 'bg-canvas-1',
  c2: 'bg-canvas-2',
  c3: 'bg-canvas-3',
  c4: 'bg-canvas-4',
  c5: 'bg-canvas-5',
  c6: 'bg-canvas-6',
  anchor: 'bg-foreground',
  quiet: 'bg-muted-foreground/40',
}

export interface LabelledNode {
  id: string
  label: string
}

/** 画板上所有可被引用的节点及其标题，供 AI 提案把标题解析回稳定 node id */
export function listNodeLabels(growthEvents: GrowthEvent[], profile: StudentProfile | null): LabelledNode[] {
  return [
    ...growthEvents.map((e) => ({ id: `event:${e.id}`, label: e.title })),
    ...(profile?.targetSchools ?? []).map((s) => ({ id: `school:${s.id}`, label: s.name })),
    ...(profile?.courses ?? []).map((c) => ({ id: `course:${c.id}`, label: c.name })),
  ]
}

/** 先精确匹配再包含匹配；解析不到返回 null（提案里标红，不可入库） */
export function resolveLabelToNodeId(label: string, nodes: LabelledNode[]): string | null {
  const trimmed = label.trim()
  if (!trimmed) return null
  const exact = nodes.find((n) => n.label === trimmed)
  if (exact) return exact.id
  const partial = nodes.find((n) => n.label.includes(trimmed) || trimmed.includes(n.label))
  return partial?.id ?? null
}

/** 没有保存过坐标的节点用这套确定性布局：按类型分列，学生拖动后即固化 */
const COLUMN_X = { school: 0, long: 340, short: 680, course: 1020 } as const
const ROW_GAP = 92

interface BuildInput {
  growthEvents: GrowthEvent[]
  profile: StudentProfile | null
  canvasNodes: CanvasNode[]
  canvasEdges: CanvasEdge[]
  artifacts: Artifact[]
  /** 只显示这些类别；空集合表示全部 */
  categoryFilter: Set<EventCategory>
}

export interface BuiltNode {
  id: string
  x: number
  y: number
  data: CanvasNodeData
}

export interface BuiltEdge {
  id: string
  source: string
  target: string
  label: string
  strength: number
  artifactTitle?: string
  artifactId?: string
}

export interface BuiltCanvas {
  nodes: BuiltNode[]
  edges: BuiltEdge[]
  /** 还没绑到任何一条边上的反思——画板抽屉的「待连接」区 */
  unlinkedReflections: Artifact[]
}

export function buildCanvas({
  growthEvents,
  profile,
  canvasNodes,
  canvasEdges,
  artifacts,
  categoryFilter,
}: BuildInput): BuiltCanvas {
  const saved = new Map(canvasNodes.map((n) => [n.id, n]))
  const nodes: BuiltNode[] = []
  const counters = { school: 0, long: 0, short: 0, course: 0 }

  const place = (id: string, column: keyof typeof COLUMN_X, data: CanvasNodeData) => {
    const stored = saved.get(id)
    const index = counters[column]++
    nodes.push({
      id,
      x: stored?.x ?? COLUMN_X[column],
      y: stored?.y ?? index * ROW_GAP,
      data: { ...data, blurb: stored?.blurb },
    })
  }

  for (const school of profile?.targetSchools ?? []) {
    place(`school:${school.id}`, 'school', {
      label: school.name,
      tone: 'anchor',
      meta: school.major,
      kind: 'school',
    })
  }

  const visible = growthEvents.filter(
    (e) => categoryFilter.size === 0 || categoryFilter.has(e.category),
  )
  for (const event of visible) {
    place(`event:${event.id}`, event.kind === 'long' ? 'long' : 'short', {
      label: event.title,
      tone: toneFor(event.category),
      meta: event.kind === 'long' ? (event.endDate ? `${event.startDate} → ${event.endDate}` : `${event.startDate} →`) : event.startDate,
      kind: 'event',
    })
  }

  for (const course of profile?.courses ?? []) {
    place(`course:${course.id}`, 'course', {
      label: course.name,
      tone: 'quiet',
      meta: course.level,
      kind: 'course',
    })
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const artifactById = new Map(artifacts.map((a) => [a.id, a]))

  // 端点解析不到就不画。S4 的反思卫星节点在新模型里不再是节点（反思是边的内容），
  // 那批边因此自然消失，信息没丢——关联关系已经在 artifact.linkedNodeIds 里。
  const edges: BuiltEdge[] = canvasEdges
    .filter((e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId))
    .map((e) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      label: e.label,
      strength: e.strength ?? 3,
      artifactId: e.artifactId,
      artifactTitle: e.artifactId ? artifactById.get(e.artifactId)?.title : undefined,
    }))

  const boundArtifactIds = new Set(canvasEdges.map((e) => e.artifactId).filter(Boolean))
  const unlinkedReflections = artifacts.filter(
    (a) => a.kind === 'reflection' && !boundArtifactIds.has(a.id),
  )

  return { nodes, edges, unlinkedReflections }
}
