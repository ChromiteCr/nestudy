import { create } from 'zustand'
import { computeReminders, type Reminder } from '@/lib/engine/rules'
import { getSettings, patchSettings } from '@/lib/db/repositories'
import { isoToday } from '@/lib/db/planning'
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
    const settings = await getSettings()
    const { profile, tasks, events, activities, reflections } = usePlanningStore.getState()
    const all = computeReminders({ profile, tasks, events, activities, reflections, lastActiveAt: settings.lastActiveAt })
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
