/**
 * 与 relay 的 `server/src/protocol.ts` 成对的那一份。改一边就得改另一边。
 *
 * **手抄而不是跨仓库 import**：这两个东西在两个 git 仓库里，前端的构建不该
 * 依赖后端的源码树。就这么些字面量，抄一遍便宜得多。
 *
 * relay 是与 nes modeling 共用的同一个进程——账号、额度、skill 商店都是同一份。
 * 所以这里出现的模型名、错误码、判据名，那边也认。
 */

export type ErrorCode =
  | 'bad_request'
  | 'skill_invalid'
  | 'skill_name_reserved'
  | 'skill_version_stale'
  | 'invalid_email'
  | 'invite_required'
  | 'invite_invalid'
  | 'code_invalid'
  | 'code_expired'
  | 'invalid_token'
  | 'rate_limited'
  | 'quota_exhausted'
  | 'account_blocked'
  | 'forbidden'
  | 'content_invalid'
  | 'not_found'
  | 'upstream_failed'
  | 'server_error'

export type Tier = 'tutor' | 'quick'

/** 发给转发接口的模型名。上游是谁前端永远不知道，也不该知道 */
export const RELAY_MODEL: Record<Tier, string> = {
  tutor: 'nes-tutor',
  quick: 'nes-quick',
}

export interface QuotaView {
  used: number
  limit: number
  /** 归零时刻（毫秒时间戳） */
  resetsAt: number
}

export type Quotas = Record<Tier, QuotaView>

export interface MeView {
  id: string
  email: string
  /** 自己填的，没填就是 null。不从邮箱前缀猜——猜出来的名字比留空更让人想去改 */
  name: string | null
  role: 'student' | 'teacher'
  quotas: Quotas
}

// ---- Skill 商店 ----

export const REVIEW_CRITERIA = [
  'authority',
  'impersonation',
  'exfiltration',
  'truthful',
  'boundary',
  'ghostwriting',
] as const

export type ReviewCriterion = (typeof REVIEW_CRITERIA)[number]

export const CRITERION_LABEL: Record<ReviewCriterion, string> = {
  authority: '越权诱导',
  impersonation: '冒充官方',
  exfiltration: '数据外泄',
  truthful: '名实一致',
  boundary: '边界条款',
  ghostwriting: '代写',
}

export interface ReviewVerdict {
  criterion: ReviewCriterion
  verdict: 'clean' | 'concern'
  note: string
}

export interface SkillReview {
  verdicts: ReviewVerdict[]
  clean: boolean
  /** 模型没按格式回话时的原因。有这一条就说明「不干净」不是它真判出来的 */
  fault?: string
  reviewedAt: number
}

export type SubmissionState = 'pending' | 'rejected'

/**
 * 商店列表里的一条。
 *
 * `capabilities` 是**原样**抄自 frontmatter 的字符串——商店不核对能力名，
 * 因为它同时伺候两个应用、两边词表不一样。**这边装的时候自己算缺哪个**，
 * 那才是这件事真正要紧的时刻。
 */
export interface SkillListing {
  id: string
  authorId: string
  author: string
  name: string
  version: string
  displayName: string
  description: string
  category: string
  skillStatus: string
  compatibleAgents: string[]
  capabilities: string[]
  listedAt: number
  updatedAt: number
}

export interface SkillDetail extends SkillListing {
  text: string
}

export interface SkillPage {
  total: number
  limit: number
  offset: number
  items: SkillListing[]
}

/** 「我投的」里的一条。上架了的不在这里——它已经在商店里了 */
export interface SkillSubmissionView {
  id: string
  name: string
  version: string
  state: SubmissionState
  review: SkillReview
  createdAt: number
  updatedAt: number
}

/**
 * 待审队列里的一条（teacher 才拿得到）。
 *
 * 比「我投的」多了作者与正文——**裁决必须看得到正文**，
 * 只看模型给的理由就点放行，等于把判断权整个交给了那次审核。
 */
export interface SkillQueueItem extends SkillSubmissionView {
  authorId: string
  author: string
  text: string
}

export interface PublishResult {
  state: 'listed' | 'pending'
  review: SkillReview
  warnings: string[]
}
