import { create } from 'zustand'
import { getSettings, patchSettings } from '@/lib/db/repositories'
import { barPlugins, isPluginEnabled, syncPluginCapabilities } from '@/plugins/registry'
import type { PluginManifest } from '@/plugins/types'
import type { PluginPrefs } from '@/types'

interface PluginState {
  prefs: PluginPrefs
  loaded: boolean
  /** 开屏调一次：读偏好并把能力面对齐上去 */
  load: () => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  setOnBar: (id: string, onBar: boolean) => Promise<void>
  /** 整条顺序一次写完（拖拽结束时调，不是拖动过程中每帧调） */
  setOrder: (ids: string[]) => Promise<void>
}

export const usePluginStore = create<PluginState>((set, get) => ({
  prefs: {},
  loaded: false,

  load: async () => {
    const settings = await getSettings()
    const prefs = settings.pluginPrefs ?? {}
    // 先对齐能力面再 set：否则第一帧界面已经把插件画成「开着」，
    // 而模型那一侧的工具面还是空的
    syncPluginCapabilities(prefs)
    set({ prefs, loaded: true })
  },

  setEnabled: async (id, enabled) => {
    const disabled = new Set(get().prefs.disabled ?? [])
    if (enabled) disabled.delete(id)
    else disabled.add(id)
    await commit(set, get, { disabled: [...disabled] })
  },

  setOnBar: async (id, onBar) => {
    const offBar = new Set(get().prefs.offBar ?? [])
    if (onBar) offBar.delete(id)
    else offBar.add(id)
    await commit(set, get, { offBar: [...offBar] })
  },

  setOrder: async (ids) => {
    await commit(set, get, { order: ids })
  },
}))

/**
 * 三个 setter 的共同尾巴：**先落地到内存与注册表，再写库**。
 *
 * 顺序是有意的——开关是个按钮，点下去要当场动；等一次 IndexedDB 往返再重绘，
 * 手感上就是「点了没反应」。写库失败也不回滚：那只意味着这次偏好没存住，
 * 下次开屏回到旧状态，比当场把开关弹回去要不吓人。
 */
async function commit(
  set: (partial: Partial<PluginState>) => void,
  get: () => PluginState,
  patch: Partial<PluginPrefs>,
): Promise<void> {
  const prefs = { ...get().prefs, ...patch }
  syncPluginCapabilities(prefs)
  set({ prefs })
  await patchSettings({ pluginPrefs: prefs })
}

/** 插件栏该画哪几格，按顺序 */
export function useBarPlugins(): PluginManifest[] {
  return barPlugins(usePluginStore((s) => s.prefs))
}

export function usePluginEnabled(id: string): boolean {
  return usePluginStore((s) => isPluginEnabled(id, s.prefs))
}
