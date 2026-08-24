import type {
  ErrorCode,
  MeView,
  PublishResult,
  Quotas,
  SkillDetail,
  SkillPage,
  SkillSubmissionView,
} from './types'

export * from './types'

/**
 * relay 的客户端。**这是 nestudy 里唯一会和服务器说话的地方。**
 *
 * 基址默认 `/api`：线上前端和 relay 同源（Caddy 把 `/api/*` 转给本机那个进程），
 * 开发时由 vite 的 proxy 转到同一个地方。**两边走同一条代码路径**——
 * 不做「开发写全地址、线上写相对路径」那种分叉，分叉的那一版永远只在一边被测过。
 *
 * 账号只承载身份、用量与发布。事件、反思、画板、档案一律不经过这里，
 * 它们从来没有离开过这台浏览器。
 */
const BASE = import.meta.env.VITE_API_BASE ?? '/api'

/**
 * 会话令牌放 localStorage 而不是 IndexedDB：开屏那一刻要**同步**读到它，
 * 才能决定这一屏显示什么，而 IndexedDB 是异步的——为读一个几十字节的字符串
 * 加一段 loading 不值得。
 */
const TOKEN_KEY = 'nestudy-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // 隐私模式下 localStorage 可能直接抛。抛了就是没登录，不是崩
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 存不下就存不下，这一次会话仍然能用完 */
  }
}

/** 服务器拒绝了。`message` 是写给人看的，直接显示 */
export class ApiError extends Error {
  status: number
  code: ErrorCode | string
  detail?: unknown

  constructor(status: number, code: ErrorCode | string, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

/** 连不上和被拒绝是两件事，要让调用方分得开：一个该重试，一个不该 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('连不上服务器')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (init.auth !== false) {
    const token = getToken()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers })
  } catch (error) {
    throw new NetworkError(error)
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload: unknown = text ? JSON.parse(text) : null

  if (!response.ok) {
    const envelope = (payload as { error?: { code?: string; message?: string; detail?: unknown } })
      ?.error
    throw new ApiError(
      response.status,
      envelope?.code ?? 'server_error',
      envelope?.message ?? '出了点问题。',
      envelope?.detail,
    )
  }
  return payload as T
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

export const api = {
  // ---- 账号 ----

  requestCode: (email: string, inviteCode?: string) =>
    request<void>('/v1/auth/request-code', {
      method: 'POST',
      body: JSON.stringify(inviteCode ? { email, inviteCode } : { email }),
      auth: false,
    }),

  verify: (email: string, code: string) =>
    request<{ token: string; expiresAt: number; user: MeView }>('/v1/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
      auth: false,
    }),

  me: () => request<MeView>('/v1/me'),

  setName: (name: string) =>
    request<MeView>('/v1/me', { method: 'PATCH', body: JSON.stringify({ name }) }),

  signOut: () => request<void>('/v1/auth/sign-out', { method: 'POST' }),

  quota: () => request<Quotas>('/v1/quota'),

  // ---- Skill 商店 ----

  listSkills: (params: { q?: string; category?: string; agent?: string; limit?: number; offset?: number } = {}) =>
    request<SkillPage>(`/v1/skills${query(params)}`),

  getSkill: (authorId: string, name: string) =>
    request<SkillDetail>(`/v1/skills/${encodeURIComponent(authorId)}/${encodeURIComponent(name)}`),

  /** 投稿。201=直接上架，202=落到待审——两者都是成功，靠 `state` 分 */
  publishSkill: (text: string) =>
    request<PublishResult>('/v1/skills', { method: 'POST', body: JSON.stringify({ text }) }),

  mySubmissions: () => request<{ items: SkillSubmissionView[] }>('/v1/skills/mine'),

  withdrawSkill: (name: string) =>
    request<void>(`/v1/skills/${encodeURIComponent(name)}`, { method: 'DELETE' }),
}
