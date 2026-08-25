import type { ToolDef } from '@/lib/ai/provider'
import type { AskRequest, Proposal } from '@/types'

/**
 * Capability = agent 能做的一件事。
 *
 * 分三类，边界就是这个项目从 S2 起的底线：
 * - `read`：自动执行，让模型了解现状
 * - `propose`：**不写库**，解析成提案渲染确认卡，用户点确认才由应用写入
 * - `ask`：**不碰数据**，渲染一张选择题卡片，然后停下等人回答
 *
 * 三类都不写库。任何"直接写"的能力都不该出现在这里。
 * `ask` 之所以单列而不是并进 `propose`：它停机（等人）而提案不停机，
 * 而且它没有"确认之后写什么"这一步——共用一条分支会让两边都变糊。
 */
export type CapabilityKind = 'read' | 'propose' | 'ask'

/** 谁注册的。S13 的 plugin 用 `plugin:<name>`，禁用 plugin 时按 owner 整体撤销 */
export type CapabilityOwner = 'core' | `plugin:${string}`

export interface Capability {
  /** 下发给模型的工具名，同时是 SKILL.md 里 capabilities 声明的名字 */
  name: string
  kind: CapabilityKind
  /**
   * 给学生看的名字，对话里就显示这个。
   * `get_profile` 对开发者是精确的，对高中生是噪音——聊天流里该说「查看档案」。
   * 原始工具名与参数不删，收进展开区，谁想核对随时能看。
   */
  label: string
  /**
   * 按本次调用的参数细化 label，例如 get_events(kind=long) → 「查看长期经历」。
   * 返回 undefined 就用 label。
   */
  describeCall?: (rawArgs: string) => string | undefined
  /** 一句话说明会读什么 / 会提案什么，展示在 skill 卡片上让用户判断要不要授权 */
  summary: string
  schema: ToolDef
  owner: CapabilityOwner
  /**
   * **必须在 SKILL.md 里点名声明才给。**
   *
   * 其余读能力都是本地的、免费的、读的还是学生自己的东西，所以「没声明就给全部读」
   * 是个安全的默认值。网页那两个不一样：**它们要花钱，而且会把字发出这台设备**。
   * 一个漏写声明的 skill 拿到写权限是明显的错，拿到「能往外发字」同样是，
   * 只是不那么显眼——所以这类能力从默认那一份里摘出来，
   * 让它必须出现在声明里，也就必然出现在用户装之前看到的那张卡上。
   */
  requiresDeclaration?: boolean
  /**
   * 无论 skill 怎么收窄都保留。目前只有 read_skill：
   * 它是发现机制本身，收掉它 agent 就再也读不到别的 skill 了。
   * 只能给纯读、且读的内容本身就是公开文本的能力加这个标记。
   */
  alwaysGranted?: boolean
  /** kind === 'read'：执行并返回给模型的 JSON 字符串 */
  execute?: (rawArgs: string) => Promise<string>
  /** kind === 'propose'：解析模型参数为提案；返回 null 表示提案为空，不出卡 */
  parse?: (rawArgs: string) => Proposal | null
  /** kind === 'ask'：解析模型参数为一组问题 */
  ask?: (rawArgs: string) => AskOutcome
}

export interface AskOutcome {
  /** null 表示没有可展示的问题，不出卡 */
  request: AskRequest | null
  /** 解析时被丢弃或截断的部分，如实回给模型——它得知道有几问没问出去 */
  notes?: string[]
}
