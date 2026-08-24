import { create } from 'zustand'
import { ApiError, api, getToken, setToken, type MeView } from '@/lib/api'

/**
 * 账号。**它只承载身份、用量与发布**——事件、反思、画板、档案一律不经过服务器，
 * 登录与否都不影响这些东西还在不在这台浏览器里。
 *
 * 所以这个 store 允许一直是「没登录」：整个应用在没有账号的情况下要完整可用，
 * 缺的只有免费模型通道和 skill 商店。
 */

interface AccountState {
  me: MeView | null
  /** 开屏那一刻本地就有令牌，先当作「可能已登录」，等 `load()` 问过服务器再定 */
  loading: boolean
  /** 上一次和服务器说话失败的原因。连不上和被拒绝要分得开 */
  offline: boolean

  load: () => Promise<void>
  requestCode: (email: string, inviteCode?: string) => Promise<void>
  verify: (email: string, code: string) => Promise<void>
  setName: (name: string) => Promise<void>
  signOut: () => Promise<void>
  refreshQuota: () => Promise<void>
}

export const useAccountStore = create<AccountState>((set, get) => ({
  me: null,
  loading: Boolean(getToken()),
  offline: false,

  load: async () => {
    if (!getToken()) {
      set({ me: null, loading: false })
      return
    }
    set({ loading: true })
    try {
      set({ me: await api.me(), offline: false })
    } catch (error) {
      // 令牌过期／被吊销：本地那份已经没用了，清掉，让界面回到未登录
      if (error instanceof ApiError && error.status === 401) {
        setToken(null)
        set({ me: null })
      } else {
        // 连不上不等于没登录。**不清令牌**——网络回来之后他还是他，
        // 清了的话地铁里刷新一次就要重新收一封验证码
        set({ offline: true })
      }
    } finally {
      set({ loading: false })
    }
  },

  requestCode: async (email, inviteCode) => {
    await api.requestCode(email, inviteCode)
  },

  verify: async (email, code) => {
    const { token, user } = await api.verify(email, code)
    setToken(token)
    set({ me: user, offline: false })
  },

  setName: async (name) => {
    set({ me: await api.setName(name) })
  },

  signOut: async () => {
    // 先把服务器那边的会话作废，再清本地。反过来的话本地清了、
    // 服务器上那条会话还能用满 90 天
    try {
      await api.signOut()
    } catch {
      /* 服务器不在也要能退出来，本地清掉就是退出了 */
    }
    setToken(null)
    set({ me: null })
  },

  refreshQuota: async () => {
    const me = get().me
    if (!me) return
    try {
      set({ me: { ...me, quotas: await api.quota() } })
    } catch {
      /* 额度显示旧的比显示错的好，静默 */
    }
  },
}))
