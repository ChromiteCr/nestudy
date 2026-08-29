import type { SkillManifest } from '@/lib/skills/types'
import type { Capability, CapabilityOwner } from './types'

/**
 * 开放的 Capability 注册表。
 *
 * 刻意不是一个硬编码数组：S13 的 plugin 要能在构建期把自己的 capability 注册进来，
 * 而"能注册"这件事的接口形状必须**现在**定下来，否则那时候整层返工。
 * plugin 被禁用时按 owner 整体撤销，依赖它的 skill 在商店里置灰，
 * 而不是跑到一半才发现工具不存在。
 */

const registry = new Map<string, Capability>()

/**
 * 不可变快照，随注册表变动整体换一个新数组。
 *
 * 存在的理由是 `useSyncExternalStore` 要求 getSnapshot **同一状态下返回同一个引用**——
 * 直接给它 `listCapabilities()` 会每次产出新数组，React 判定「变了」于是无限重渲染。
 * 所以变动时换一次引用，不变时一直是同一个。
 */
let snapshot: Capability[] = []
const listeners = new Set<() => void>()

/**
 * 能力面变了就通知订阅者。
 *
 * S16a 之前注册表是**一次性**的：核心能力在 `main.tsx` 的副作用 import 里全部注册完，
 * 之后再没变过，所以 `SkillsView` 与 `Composer` 直接调 `listCapabilities()` 是安全的。
 * plugin 可以中途启停之后这个前提就没了——学生开了插件，能力清单却还是旧的，
 * 得刷新一次才看得见。变动通知是补上这个空档，不是新功能。
 */
function changed(): void {
  snapshot = [...registry.values()]
  for (const fn of listeners) fn()
}

export function subscribeCapabilities(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** 给 `useSyncExternalStore` 用；引用只在能力面真的变了之后才换 */
export function capabilitiesSnapshot(): Capability[] {
  return snapshot
}

export function registerCapability(cap: Capability): void {
  const existing = registry.get(cap.name)
  if (existing) {
    // 重名会让白名单判断失去意义（用户以为授权的是 A，实际跑的是 B），直接拒绝
    throw new Error(`capability 重名：${cap.name}（已由 ${existing.owner} 注册）`)
  }
  registry.set(cap.name, cap)
  changed()
}

/** 撤销某个 owner 注册的全部能力（S13：禁用 plugin） */
export function unregisterOwner(owner: CapabilityOwner): void {
  let hit = false
  for (const [name, cap] of registry) {
    if (cap.owner === owner) {
      registry.delete(name)
      hit = true
    }
  }
  // 没删掉任何东西就不通知：禁用一个没注册过能力的纯视图插件不该让整个界面重渲染
  if (hit) changed()
}

export function getCapability(name: string): Capability | undefined {
  return registry.get(name)
}

export function listCapabilities(): Capability[] {
  return [...registry.values()]
}

export interface ResolvedCapabilities {
  /** 本次运行实际下发 schema 的能力 */
  granted: Capability[]
  /** skill 声明了但注册表里没有的必需能力——skill 应被视为不可用 */
  missing: string[]
  /** 声明了但没有的可选能力，只是少点本事，能跑 */
  missingOptional: string[]
}

/**
 * 按 skill 声明解析出本次运行的能力面。
 *
 * - 没有激活 skill：给全部能力（自由对话的学栖本体）
 * - skill 没声明 capabilities：**给读能力与提问能力**，但**不给标了
 *   `requiresDeclaration` 的那几个**（网页搜索与取页）。这是安全默认值——
 *   社区 skill 的作者漏写一行，不该因此拿到写权限。提问不碰数据，
 *   一张选择题卡片能造成的最坏后果不比模型自己说话更严重，
 *   所以"缺省即只读"这条守的是**不写库**，不必连问一句都不许。
 *   网页那两个之所以另算：它们花钱，而且**会把字发出这台设备**——
 *   那是另一类后果，不该跟着"读"一起白送
 * - 声明了：按声明给，注册表里没有的记进 missing
 */
export function resolveForSkill(manifest: SkillManifest | null): ResolvedCapabilities {
  return narrowForSkill(listCapabilities(), manifest)
}

/**
 * 在给定的能力面上按 skill 声明**收窄**。
 *
 * 只收窄，不放宽：结果永远是 base 的子集，所以一个 skill 拿不到用户本来就没有的能力，
 * 连读多个 skill 也只会越收越紧。执行器每读进一个 skill 就在当前面上再收一次。
 */
export function narrowForSkill(base: Capability[], manifest: SkillManifest | null): ResolvedCapabilities {
  const always = base.filter((c) => c.alwaysGranted)
  const withAlways = (list: Capability[]) => {
    const out = [...list]
    for (const cap of always) if (!out.some((c) => c.name === cap.name)) out.push(cap)
    return out
  }

  if (!manifest) return { granted: base, missing: [], missingOptional: [] }
  if (manifest.readOnly) {
    return {
      granted: withAlways(
        base.filter((c) => (c.kind === 'read' || c.kind === 'ask') && !c.requiresDeclaration),
      ),
      missing: [],
      missingOptional: [],
    }
  }

  const available = new Map(base.map((c) => [c.name, c]))
  const granted: Capability[] = []
  const missing: string[] = []
  for (const name of manifest.capabilities) {
    const cap = available.get(name)
    if (cap) granted.push(cap)
    else missing.push(name)
  }
  const missingOptional: string[] = []
  for (const name of manifest.optionalCapabilities) {
    const cap = available.get(name)
    if (cap) {
      if (!granted.some((c) => c.name === cap.name)) granted.push(cap)
    } else {
      missingOptional.push(name)
    }
  }
  return { granted: withAlways(granted), missing, missingOptional }
}
