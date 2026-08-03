/**
 * v5 → v6 数据迁移：分表的 tasks / events / activities 合并为 growthEvents，
 * reflections 并入 artifacts，narrativeEdges + graphNodeMeta 换成 canvasEdges + canvasNodes。
 *
 * 这里只放纯函数，Dexie 的 version(6).upgrade 与 backup.importAll（读 v5 旧备份）共用同一套映射，
 * 避免两条路径各写一遍导致行为漂移。
 */
import type {
  Activity,
  Artifact,
  CanvasEdge,
  CanvasNode,
  EventItem,
  GraphNodeId,
  GraphNodeMeta,
  GrowthEvent,
  NarrativeEdge,
  Reflection,
  ShortEventCategory,
  Task,
} from '@/types'

/** 活动节点前缀随着 activities 并入 growthEvents 一起改名；其余前缀（course/school/reflection）不变 */
export function rewriteNodeId(nodeId: GraphNodeId): GraphNodeId {
  return nodeId.startsWith('activity:') ? `event:${nodeId.slice('activity:'.length)}` : nodeId
}

export function taskToGrowthEvent(t: Task): GrowthEvent {
  return {
    id: t.id,
    kind: 'short',
    title: t.title,
    category: 'task',
    startDate: t.dueDate,
    endDate: null,
    status: t.status === 'completed' ? 'done' : 'pending',
    priority: t.priority,
    parentId: t.parentEventId,
    source: t.source,
    createdAt: t.createdAt,
  }
}

export function eventItemToGrowthEvent(e: EventItem): GrowthEvent {
  // 旧 EventType 的 'activity' 指"一次性活动"，与 kind='long' 的活动不是一回事，落到 'other'
  const category: ShortEventCategory = e.type === 'activity' ? 'other' : e.type
  return {
    id: e.id,
    kind: 'short',
    title: e.title,
    category,
    startDate: e.date,
    endDate: null,
    status: 'pending',
    source: e.source,
    createdAt: e.createdAt,
  }
}

export function activityToGrowthEvent(a: Activity): GrowthEvent {
  return {
    id: a.id,
    kind: 'long',
    title: a.title,
    category: a.category,
    startDate: a.startDate,
    endDate: a.endDate,
    status: a.endDate ? 'done' : 'ongoing',
    role: a.role,
    organization: a.organization,
    description: a.description,
    achievements: a.achievements,
    level: a.level,
    source: a.source,
    createdAt: a.createdAt,
  }
}

export function reflectionToArtifact(r: Reflection): Artifact {
  return {
    id: r.id,
    kind: 'reflection',
    title: r.title,
    format: 'markdown',
    content: r.summary,
    qa: r.qa,
    // 原来靠 activityId 关联活动，现在统一成画板节点引用
    linkedNodeIds: r.activityId ? [`event:${r.activityId}`] : [],
    attachments: r.attachments,
    tags: [],
    createdAt: r.createdAt,
  }
}

export function narrativeEdgeToCanvasEdge(e: NarrativeEdge): CanvasEdge {
  return {
    id: e.id,
    sourceNodeId: rewriteNodeId(e.sourceNodeId),
    targetNodeId: rewriteNodeId(e.targetNodeId),
    label: e.label,
    strength: e.strength,
    source: e.source,
    createdAt: e.createdAt,
  }
}

/** 每行网格 6 列，仅用于给迁移出来的节点一个合法初始坐标；S7 画板会对没有坐标的节点自动布局 */
const GRID_COLUMNS = 6
const GRID_X = 260
const GRID_Y = 180

export function graphNodeMetaToCanvasNode(m: GraphNodeMeta, index: number): CanvasNode {
  return {
    id: rewriteNodeId(m.nodeId),
    x: (index % GRID_COLUMNS) * GRID_X,
    y: Math.floor(index / GRID_COLUMNS) * GRID_Y,
    blurb: m.blurb,
  }
}

export interface LegacyTables {
  events?: EventItem[]
  tasks?: Task[]
  activities?: Activity[]
  narrativeEdges?: NarrativeEdge[]
  graphNodeMeta?: GraphNodeMeta[]
  reflections?: Reflection[]
}

export interface MigratedTables {
  growthEvents: GrowthEvent[]
  artifacts: Artifact[]
  canvasNodes: CanvasNode[]
  canvasEdges: CanvasEdge[]
}

/** 把一整套 v5 分表转换成 v6 的四张表 */
export function migrateLegacyTables(legacy: LegacyTables): MigratedTables {
  return {
    growthEvents: [
      ...(legacy.tasks ?? []).map(taskToGrowthEvent),
      ...(legacy.events ?? []).map(eventItemToGrowthEvent),
      ...(legacy.activities ?? []).map(activityToGrowthEvent),
    ],
    artifacts: (legacy.reflections ?? []).map(reflectionToArtifact),
    canvasEdges: (legacy.narrativeEdges ?? []).map(narrativeEdgeToCanvasEdge),
    canvasNodes: (legacy.graphNodeMeta ?? []).map(graphNodeMetaToCanvasNode),
  }
}
