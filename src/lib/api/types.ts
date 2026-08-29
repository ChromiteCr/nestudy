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
  | 'web_unavailable'
  | 'web_blocked'
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

/**
 * 额度。**按 token，不按轮。**
 *
 * 曾经是按轮的，而 nestudy 的 agent loop 一次技能运行就是六到八次调用——
 * 按轮算等于同一件事被收八遍，200 次/周第一周就爆。按 token 算之后，
 * 轮次花多少就是多少，档位（tutor/quick）只剩「路由到哪个上游模型」这一个作用。
 *
 * 代价是 token 数学生数不清，所以界面上给**剩余比例**而不是那个七位数。
 */
export interface QuotaView {
  usedTokens: number
  limitTokens: number
  /** 这个账号的倍数，默认 1。不是 1 的时候要显示，否则「额度很少」看起来像故障 */
  multiplier: number
  /** 归零时刻（毫秒时间戳） */
  resetsAt: number
}

export interface MeView {
  id: string
  email: string
  /** 自己填的，没填就是 null。不从邮箱前缀猜——猜出来的名字比留空更让人想去改 */
  name: string | null
  role: 'student' | 'teacher'
  quota: QuotaView
}

/**
 * 看板上的一行：一个账号，和它今天用掉了多少。
 *
 * **这不是学生的学习数据。** 服务器上从来没有事项、反思、画板、档案——
 * 那些一个字都没离开过学生的浏览器。这里能看到的只有身份与用量，
 * 也就是设置页那段边界说明里「服务器存的是你的邮箱、用了多少额度」那半句。
 *
 * 字段是 relay 现成 `GET /v1/roster` 的子集，只取学栖用得上的几项：
 * 那个接口还带 `submission`（modeling 的作业提交），学栖没有这个概念，不取。
 */
export interface BoardUser {
  id: string
  email: string
  name: string | null
  role: 'student' | 'teacher'
  createdAt: number
  blocked: boolean
  /** 最近一次带着令牌来过的时间。从没登录过就是 null */
  lastSeenAt: number | null
  /** 这个账号的额度倍数。0.1 倍的人「用得少」是设定，不是他不学习 */
  multiplier: number
  /** 今天（UTC+8）的调用次数，含失败与在飞的那次 */
  callsToday: number
  /** 今天（UTC+8）的 prompt + completion token */
  tokensToday: number
}

export interface BoardView {
  /** 服务器算的那一天（UTC+8）。**不让前端按浏览器时区自己算**——
      老师人在哪个时区，表头上那天都该是服务器计数用的那天 */
  day: string
  week: string
  users: BoardUser[]
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

// ---- 网页 ----

/** 一条搜索结果。**大部分价值在 snippet 上**——大学官网挡自动抓取，摘要却进得了索引 */
export interface WebSearchHit {
  title: string
  url: string
  snippet: string
  /** 站点发布或更新的日期，有就给。申请要求年年变，没有日期的资料不敢用 */
  published?: string
}

export interface WebSearchResponse {
  query: string
  hits: WebSearchHit[]
  /** 今天还能搜几次。给模型看，让它自己收着点，不用等撞到 429 */
  remainingToday: number
}

export interface WebFetchResponse {
  /** 跟完重定向之后真正读到的那个地址，不一定是传进去的那个 */
  url: string
  title: string
  text: string
  truncated: boolean
  remainingToday: number
}
