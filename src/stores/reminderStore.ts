import { create } from 'zustand'
import { computeReminders, type Reminder } from '@/lib/engine/rules'
import { getSettings, patchSettings } from '@/lib/db/repositories'
import { isoToday } from '@/lib/db/dates'
import { listUsedSkillNames } from '@/lib/db/skill-runs'
import { usePlanningStore } from './planningStore'

interface ReminderState {
  reminders: Reminder[]
  /** 打开应用时调用（planningStore 加载完成后）：计算提醒并刷新 lastActiveAt */
  init: () => Promise<void>
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
    })
    // 当天已关闭的不再显示
    const today = isoToday()
    const dismissed = settings.dismissedReminders ?? {}
    set({ reminders: all.filter((r) => dismissed[r.key] !== today) })
    await patchSettings({ lastActiveAt: Date.now() })
  },

  dismiss: async (key) => {
    set({ reminders: get().reminders.filter((r) => r.key !== key) })
    const settings = await getSettings()
    await patchSettings({
      dismissedReminders: { ...(settings.dismissedReminders ?? {}), [key]: isoToday() },
    })
  },
}))
