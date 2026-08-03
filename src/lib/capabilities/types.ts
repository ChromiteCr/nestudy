import type { ToolDef } from '@/lib/ai/provider'
import type { Proposal } from '@/types'

/**
 * Capability = agent 能做的一件事。
 *
 * 分两类，边界就是这个项目从 S2 起的底线：
 * - `read`：自动执行，让模型了解现状
 * - `propose`：**不写库**，解析成提案渲染确认卡，用户点确认才由应用写入
 *
 * 没有第三类。任何"直接写"的能力都不该出现在这里。
 */
export type CapabilityKind = 'read' | 'propose'

/** 谁注册的。S13 的 plugin 用 `plugin:<name>`，禁用 plugin 时按 owner 整体撤销 */
export type CapabilityOwner = 'core' | `plugin:${string}`

export interface Capability {
  /** 下发给模型的工具名，同时是 SKILL.md 里 capabilities 声明的名字 */
  name: string
  kind: CapabilityKind
  /** 一句话说明会读什么 / 会提案什么，展示在 skill 卡片上让用户判断要不要授权 */
  summary: string
  schema: ToolDef
  owner: CapabilityOwner
  /** kind === 'read'：执行并返回给模型的 JSON 字符串 */
  execute?: (rawArgs: string) => Promise<string>
  /** kind === 'propose'：解析模型参数为提案；返回 null 表示提案为空，不出卡 */
  parse?: (rawArgs: string) => Proposal | null
}
