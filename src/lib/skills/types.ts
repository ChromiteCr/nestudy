/**
 * SKILL.md 的运行时形状。
 *
 * 格式的权威定义在 `Skills` 仓库（`scripts/validate.sh` + `CONTRIBUTING.md`），
 * 这里只是它的 TypeScript 投影。必填键与那边一致；`capabilities` 等几个
 * StudyNest 扩展键是**可选**的，写在同一份 SKILL.md 里——validate.sh 不拒绝
 * 额外键、Claude Code 忽略未知键，所以同一份文件两边都能跑，不需要 fork 格式。
 */

export type SkillStatus = 'draft' | 'beta' | 'stable' | 'deprecated'
export type SkillPriority = 'P0' | 'P1' | 'P2' | 'P3'

/**
 * 结构化输出协议 v1。概念文档列了 9 种，这一版只认 4 种，
 * 且**全部走提案确认卡**——"AI 不直接写库"是从 S2 贯穿至今的底线，不因为换成 skill 而破。
 */
export const SKILL_OUTPUTS = ['chat', 'document', 'canvas', 'event'] as const
export type SkillOutput = (typeof SKILL_OUTPUTS)[number]

export const OUTPUT_LABEL: Record<SkillOutput, string> = {
  chat: '对话',
  document: '文档',
  canvas: '画板',
  event: '事项',
}

/** 每种输出落地时必须具备的能力；加载时用它校验声明是否自洽 */
export const OUTPUT_CAPABILITY: Record<SkillOutput, string | null> = {
  chat: null,
  document: 'propose_artifact',
  canvas: 'propose_canvas',
  event: 'propose_events',
}

/** 轮数上限的缺省值。S5 的 4 轮太少——读三样数据再产出就已经用光了 */
export const DEFAULT_MAX_ROUNDS = 8
export const MAX_ALLOWED_ROUNDS = 20

export interface SkillManifest {
  /** kebab-case，等于 skill 目录名 */
  name: string
  /** 界面展示名；缺省回落到 name */
  displayName: string
  description: string
  category: string
  version: string
  status: SkillStatus
  priority: SkillPriority
  compatibleAgents: string[]
  /** 运行本 skill 必需的能力名。**空数组 = 未声明 = 只读**（安全默认值） */
  capabilities: string[]
  /** 声明了 capabilities 时才有意义：有则更好、缺了也能跑 */
  optionalCapabilities: string[]
  /** 未声明 capabilities 的 skill 只读，运行时给全部读能力 */
  readOnly: boolean
  outputs: SkillOutput[]
  maxRounds: number
  suggestHint?: string
}

export interface LoadedSkill {
  manifest: SkillManifest
  /** frontmatter 之后的正文，激活时作为人设注入 system prompt */
  body: string
  origin: 'builtin' | 'installed'
  /** 出错时用来定位：内置是生成物里的相对路径，安装的是商店条目 id */
  source: string
}

export interface SkillParseResult {
  skill: LoadedSkill | null
  errors: string[]
  warnings: string[]
}
