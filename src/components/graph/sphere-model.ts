import type { Activity, ActivityCategory, Reflection, StudentProfile } from '@/types'

export type SphereNodeKind = 'major' | 'activity' | 'course' | 'reflection'

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
const REFLECTION_HEX = '#8890b5'
/** 反思卫星绕父活动的偏移半径（同一 XZ 平面内的小环，与父活动同一层，不参与轨道分层系统） */
const SATELLITE_RADIUS = 34

const SHELL_RADIUS = [0, 120, 210, 290]
/** 轨道系默认俯视倾角（弧度）：让轨道环呈椭圆，减少 3D 眩晕 */
export const DEFAULT_TILT = -0.82

/** 有效专业方向：优先 profile.majorDirections，否则取目标校专业去重，再否则占位 */
export function effectiveMajors(profile: StudentProfile | null): string[] {
  const explicit = profile?.majorDirections?.filter((m) => m.trim())
  if (explicit && explicit.length) return explicit
  const fromSchools = [...new Set((profile?.targetSchools ?? []).map((s) => s.major.trim()).filter(Boolean))]
  if (fromSchools.length) return fromSchools
  return []
}

/** 默认分层（AI 整理前）：活动按级别、课程居中层 */
export function defaultActivityShell(a: Activity): number {
  if (a.level === 'international' || a.level === 'national') return 1
  return 2
}

/** 在第 shell 层的轨道环（XZ 平面圆）上取第 idx 个点（共 count 个），带相位错开 */
function ringPoint(idx: number, count: number, radius: number, phase: number): [number, number, number] {
  if (radius === 0) return [0, 0, 0]
  const angle = (idx / Math.max(count, 1)) * Math.PI * 2 + phase
  return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
}

/**
 * 构建球体节点：中心专业方向、核心/次要活动、课程。
 * shellOverride：来自 graphNodeMeta 的手动/AI 分层，优先于默认。
 */
export function buildSphereNodes(
  activities: Activity[],
  profile: StudentProfile | null,
  shellOverride: Record<string, number> = {},
  reflections: Reflection[] = [],
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
      shell: shellOverride[id] ?? defaultActivityShell(a),
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
  // 未关联活动的反思：并入外层未分类区，走标准分层（建立关联后会被下面的卫星逻辑接管）
  for (const r of reflections.filter((x) => !x.activityId)) {
    const id = `reflection:${r.id}`
    raw.push({
      id,
      kind: 'reflection',
      label: r.title,
      shell: shellOverride[id] ?? 3,
      color: REFLECTION_HEX,
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
    // 每层相位错开，避免不同层节点连成一条直线
    const phase = shell * 0.6
    arr.forEach((n, i) => {
      const base =
        shell === 0 && arr.length > 1 ? ringPoint(i, arr.length, 46, phase) : ringPoint(i, arr.length, radius, phase)
      nodes.push({ ...n, base })
    })
  }

  // 关联到活动的反思：作为卫星，基准坐标 = 父活动坐标 + 小半径偏移，复用同一套旋转/投影管线
  const linkedByActivity = new Map<string, Reflection[]>()
  for (const r of reflections) {
    if (!r.activityId) continue
    const list = linkedByActivity.get(r.activityId) ?? []
    list.push(r)
    linkedByActivity.set(r.activityId, list)
  }
  for (const [activityId, list] of linkedByActivity) {
    const parent = nodes.find((n) => n.id === `activity:${activityId}`)
    if (!parent) continue
    list.forEach((r, i) => {
      const [ox, oy, oz] = ringPoint(i, list.length, SATELLITE_RADIUS, 0.3)
      nodes.push({
        id: `reflection:${r.id}`,
        kind: 'reflection',
        label: r.title,
        shell: -1,
        color: REFLECTION_HEX,
        base: [parent.base[0] + ox, parent.base[1] + oy, parent.base[2] + oz],
      })
    })
  }

  return nodes
}

/** 存在节点的轨道层半径（用于绘制轨道环，去重升序，排除中心 0） */
export function activeOrbitRadii(nodes: SphereNode[]): number[] {
  const shells = new Set(nodes.map((n) => n.shell).filter((s) => s > 0))
  return [...shells].sort((a, b) => a - b).map((s) => SHELL_RADIUS[Math.min(s, SHELL_RADIUS.length - 1)])
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
    const isCenter = n.shell === 0
    const isReflection = n.kind === 'reflection'
    // 反思卫星视觉上更小更暗，避免抢主星的视觉重量
    const baseR = isReflection ? 6 : n.shell === 0 ? 24 : n.shell === 1 ? 16 : n.shell === 2 ? 12 : 9
    const depthScale = isCenter ? 1.1 : 0.62 + t * 0.6
    const dim = isReflection ? 0.7 : 1
    return {
      ...n,
      sx: cx + x1 * zoom,
      sy: cy + y2 * zoom,
      depth: isCenter ? maxR + 1 : z2, // 中心始终渲染在最前
      t,
      radius: baseR * depthScale * zoom,
      opacity: (isCenter ? 1 : 0.45 + t * 0.55) * dim,
    }
  })
  // 后到前渲染
  projected.sort((a, b) => a.depth - b.depth)
  return projected
}
