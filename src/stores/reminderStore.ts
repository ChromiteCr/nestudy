import { create } from 'zustand'
import {
  MAINLINE_REMINDER_KEY,
  computeReminders,
  mainlineReminder,
  mainlineYields,
  type Reminder,
} from '@/lib/engine/rules'
import { getSettings, patchSettings } from '@/lib/db/repositories'
import { isoToday } from '@/lib/db/dates'
import { listUsedSkillNames } from '@/lib/db/skill-runs'
import { usePlanningStore } from './planningStore'
import type { Settings } from '@/types'

interface ReminderState {
  reminders: Reminder[]
  /** 打开应用时调用（planningStore 加载完成后）：计算提醒并刷新 lastActiveAt */
  init: () => Promise<void>
  /**
   * 记录刚落库之后**只重算主线那一条**，其余保持开屏那份快照。
   *
   * `guard` 由调用方（chatStore）传：那边同时持有 streaming 与 messages，
   * 而 reminderStore 反向 import chatStore 会成环——chatStore 已经
   * import 了 applyProposal，而 zustand 的 `create()` 在模块顶层求值，
   * 环里必有一侧拿到 undefined。
   */
  refreshMainline: (guard?: () => boolean) => Promise<void>
  dismiss: (key: string) => Promise<void>
}

export const useReminderStore = create<ReminderState>((set, get) => ({
  reminders: [],

  init: async () => {
    const [settings, usedSkillNames] = await Promise.all([getSettings(), listUsedSkillNames()])
    const { profile, growthEvents, artifacts } = usePlanningStore.getState()
    const all = computeReminders({
      profile,
      growthEvents,
      artifacts,
      usedSkillNames,
      lastActiveAt: settings.lastActiveAt,
      mainlineShownAt: settings.mainlineShownAt,
    })
    // 当天已关闭的不再显示
    const today = isoToday()
    const dismissed = settings.dismissedReminders ?? {}
    const shown = all.filter((r) => dismissed[r.key] !== today)
    set({ reminders: shown })
    const patch: Partial<Omit<Settings, 'id'>> = { lastActiveAt: Date.now() }
    // 摆出来了才推进窗口起点——没摆的那次不能算，否则那批记录就永远错过了
    if (shown.some((r) => r.key === MAINLINE_REMINDER_KEY)) patch.mainlineShownAt = Date.now()
    await patchSettings(patch)
  },

  refreshMainline: async (guard) => {
    const settings = await getSettings()
    const { profile, growthEvents } = usePlanningStore.getState()
    const current = get().reminders
    /*
      **不调 computeReminders**，这是硬要求。R1（7 天内 DDL）、R5（`slice(0,1)`，
      「第一条」随数组顺序变）、R7（按 createdAt 倒序取一条）都会因为
      「刚确认了一张卡」当场长出或换 key，而补录旧活动、确认含近期 DDL 的事项，
      正是这个产品里最常见的两种记录。提醒条是滚动容器的兄弟节点，每多一行
      就把整个消息区往下推——他连着确认三张卡，看到的就是弹三次。
      刷屏的不会是 R8，是被它顺带重算出来的邻居。
    */
    const next = mainlineYields(current)
      ? null
      : mainlineReminder({ profile, growthEvents, mainlineShownAt: settings.mainlineShownAt })
    const shown = next && (settings.dismissedReminders ?? {})[next.key] !== isoToday() ? next : null
    // TOCTOU：上面两次 await 期间他可能已经敲了回车。set 之前再查一次，
    // 否则提醒条正好落在字往外冒的中间
    if (guard && !guard()) return
    const rest = current.filter((r) => r.key !== MAINLINE_REMINDER_KEY)
    set({ reminders: shown ? insertMainline(rest, shown) : rest })
    if (shown) await patchSettings({ mainlineShownAt: Date.now() })
    // 这里**不写 lastActiveAt**：会话中途再推一次会让 R3 回归提醒的 awayDays
    // 当场归零消失。这也是不复用 init() 的原因
  },

  dismiss: async (key) => {
    set({ reminders: get().reminders.filter((r) => r.key !== key) })
    const settings = await getSettings()
    await patchSettings({
      dismissedReminders: { ...(settings.dismissedReminders ?? {}), [key]: isoToday() },
    })
  },
}))

/**
 * 插在 R7 之后、R6「试试招生官读档」之前，和开屏那次算出来的顺序保持一致。
 * append 到最后会排在一条技能推荐下面，读起来像广告位。
 */
function insertMainline(list: Reminder[], r: Reminder): Reminder[] {
  const at = list.findIndex((x) => x.key.startsWith('suggest-skill:'))
  return at < 0 ? [...list, r] : [...list.slice(0, at), r, ...list.slice(at)]
}
