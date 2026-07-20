import type { Activity, ActivityCategory, StudentProfile } from '@/types'

export type SphereNodeKind = 'major' | 'activity' | 'course'

export interface SphereNode {
  id: string
  kind: SphereNodeKind
  label: string
  sublabel?: string
  category?: ActivityCategory
  /** 0=中心专业方向，1=核心，2=次要，3=外围 */
  shell: number
  color: string
  /** 静止时的 3D 基准坐标 */
  base: [number, number, number]
}

export interface ProjectedNode extends SphereNode {
  sx: number
  sy: number
  /** 旋转后深度（越大越靠前） */
  depth: number
  /** 深度归一 0..1（1=最前） */
  t: number
  radius: number
  opacity: number
}

/** 分类色（SVG 用十六进制；与活动列表的语义色一致） */
export const CATEGORY_HEX: Record<ActivityCategory, string> = {
  academic: '#3b82f6',
  leadership: '#f59e0b',
  service: '#10b981',
  athletics: '#f97316',
  arts: '#ec4899',
  work: '#06b6d4',
  research: '#8b5cf6',
  other: '#64748b',
}
const COURSE_HEX = '#94a3b8'

const SHELL_RADIUS = [0, 130, 225, 300]
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

/** 有效专业方向：优先 profile.majorDirections，否则取目标校专业去重，再否则占位 */
export function effectiveMajors(profile: StudentProfile | null): string[] {
  const explicit = profile?.majorDirections?.filter((m) => m.trim())
  if (explicit && explicit.length) return explicit
  const fromSchools = [...new Set((profile?.targetSchools ?? []).map((s) => s.major.trim()).filter(Boolean))]
  if (fromSchools.length) return fromSchools
  return []
}

/** 默认分层（AI 整理前）：活动按级别、课程居中层 */
function defaultShell(a: Activity): number {
  if (a.level === 'international' || a.level === 'national') return 1
  return 2
}

/** 在第 shell 层球面上按 Fibonacci 分布取第 idx 个点（共 count 个） */
function fibPoint(idx: number, count: number, radius: number): [number, number, number] {
  if (radius === 0) return [0, 0, 0]
  if (count === 1) return [0, 0, radius]
  const y = 1 - (idx / (count - 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = GOLDEN * idx
  return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius]
}

/**
 * 构建球体节点：中心专业方向、核心/次要活动、课程。
 * shellOverride：来自 graphNodeMeta 的手动/AI 分层，优先于默认。
 */
export function buildSphereNodes(
  activities: Activity[],
  profile: StudentProfile | null,
  shellOverride: Record<string, number> = {},
): SphereNode[] {
  const majors = effectiveMajors(profile)
  const raw: Omit<SphereNode, 'base'>[] = []

  majors.forEach((m, i) =>
    raw.push({ id: `major:${i}`, kind: 'major', label: m, shell: 0, color: 'var(--primary)' }),
  )
  for (const a of activities) {
    const id = `activity:${a.id}`
    raw.push({
      id,
      kind: 'activity',
      label: a.title,
      sublabel: a.role || a.organization || undefined,
      category: a.category,
      shell: shellOverride[id] ?? defaultShell(a),
      color: CATEGORY_HEX[a.category],
    })
  }
  for (const c of profile?.courses ?? []) {
    const id = `course:${c.id}`
    raw.push({
      id,
      kind: 'course',
      label: c.name,
      sublabel: c.level || undefined,
      shell: shellOverride[id] ?? 2,
      color: COURSE_HEX,
    })
  }

  // 按层分组后分配球面坐标
  const byShell = new Map<number, Omit<SphereNode, 'base'>[]>()
  for (const n of raw) {
    const arr = byShell.get(n.shell) ?? []
    arr.push(n)
    byShell.set(n.shell, arr)
  }

  const nodes: SphereNode[] = []
  for (const [shell, arr] of byShell) {
    const radius = SHELL_RADIUS[Math.min(shell, SHELL_RADIUS.length - 1)]
    arr.forEach((n, i) => {
      // 单个中心方向放正中；多个用小半径散开
      const base =
        shell === 0 && arr.length > 1
          ? fibPoint(i, arr.length, 44)
          : fibPoint(i, arr.length, radius)
      nodes.push({ ...n, base })
    })
  }
  return nodes
}

export const MAX_SPHERE_RADIUS = SHELL_RADIUS[SHELL_RADIUS.length - 1]

/** 按标题把 AI 给的标签解析为节点 id（精确优先，其次包含匹配） */
export function resolveLabelToNodeId(label: string, nodes: { id: string; label: string }[]): string | null {
  const trimmed = label.trim()
  const exact = nodes.find((n) => n.label === trimmed)
  if (exact) return exact.id
  const partial = nodes.find((n) => n.label.includes(trimmed) || trimmed.includes(n.label))
  return partial?.id ?? null
}

/** 绕 Y 再绕 X 旋转 + 正交投影；返回屏幕坐标与深度视觉属性 */
export function projectNodes(
  nodes: SphereNode[],
  rotX: number,
  rotY: number,
  zoom: number,
  cx: number,
  cy: number,
): ProjectedNode[] {
  const cosY = Math.cos(rotY)
  const sinY = Math.sin(rotY)
  const cosX = Math.cos(rotX)
  const sinX = Math.sin(rotX)
  const maxR = MAX_SPHERE_RADIUS

  const projected = nodes.map((n) => {
    const [x, y, z] = n.base
    const x1 = x * cosY + z * sinY
    const z1 = -x * sinY + z * cosY
    const y2 = y * cosX - z1 * sinX
    const z2 = y * sinX + z1 * cosX
    const t = (z2 + maxR) / (2 * maxR) // 0..1
    const depthScale = 0.55 + t * 0.7
    const baseR = n.shell === 0 ? 26 : n.shell === 1 ? 17 : n.shell === 2 ? 12 : 9
    return {
      ...n,
      sx: cx + x1 * zoom,
      sy: cy + y2 * zoom,
      depth: z2,
      t,
      radius: baseR * depthScale * zoom,
      opacity: 0.4 + t * 0.6,
    }
  })
  // 后到前渲染
  projected.sort((a, b) => a.depth - b.depth)
  return projected
}
