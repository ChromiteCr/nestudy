import type { Activity, ActivityCategory, StudentProfile } from '@/types'

export type GraphNodeType = 'activity' | 'course' | 'school'

/** 统一节点抽象。id 带类型前缀（activity:/course:/school:，S4 加 reflection:），使叙事线跨实体稳定引用 */
export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  category?: ActivityCategory
  sublabel?: string
}

export function activityNodeId(id: string): string {
  return `activity:${id}`
}
export function courseNodeId(id: string): string {
  return `course:${id}`
}
export function schoolNodeId(id: string): string {
  return `school:${id}`
}

/**
 * 成长网络的节点：活动 + 课程 + 目标校锚点。
 * 以内容性/实质性的部分为中心；目标校为最终指向的锚点。S4 反思在此加一路映射即可。
 */
export function buildGraphNodes(activities: Activity[], profile: StudentProfile | null): GraphNode[] {
  const nodes: GraphNode[] = []
  for (const a of activities) {
    nodes.push({
      id: activityNodeId(a.id),
      type: 'activity',
      label: a.title,
      category: a.category,
      sublabel: a.role || a.organization || undefined,
    })
  }
  for (const c of profile?.courses ?? []) {
    nodes.push({
      id: courseNodeId(c.id),
      type: 'course',
      label: c.name,
      sublabel: c.level || undefined,
    })
  }
  for (const s of profile?.targetSchools ?? []) {
    nodes.push({
      id: schoolNodeId(s.id),
      type: 'school',
      label: s.name,
      sublabel: s.major || undefined,
    })
  }
  return nodes
}

/** 按标题把 AI 给的标签解析为节点 id（精确优先，其次包含匹配） */
export function resolveLabelToNodeId(label: string, nodes: GraphNode[]): string | null {
  const trimmed = label.trim()
  const exact = nodes.find((n) => n.label === trimmed)
  if (exact) return exact.id
  const partial = nodes.find((n) => n.label.includes(trimmed) || trimmed.includes(n.label))
  return partial?.id ?? null
}
