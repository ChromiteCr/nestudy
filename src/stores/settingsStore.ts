import { create } from 'zustand'
import { DEFAULT_MODEL_CONFIG, type ModelConfig } from '@/types'
import { getSettings, patchSettings, saveModelConfig } from '@/lib/db/repositories'
import { applyThemeColor, type ThemeColor } from '@/lib/theme'

interface SettingsState {
  modelConfig: ModelConfig
  themeColor: ThemeColor | null
  loaded: boolean
  load: () => Promise<void>
  updateModelConfig: (patch: Partial<ModelConfig>) => Promise<void>
  updateThemeColor: (color: ThemeColor | null) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  modelConfig: { ...DEFAULT_MODEL_CONFIG },
  themeColor: null,
  loaded: false,

  load: async () => {
    const settings = await getSettings()
    const themeColor = settings.themeColor ?? null
    applyThemeColor(themeColor)
    set({ modelConfig: settings.modelConfig, themeColor, loaded: true })
  },

  updateModelConfig: async (patch) => {
    const next = { ...get().modelConfig, ...patch }
    set({ modelConfig: next })
    await saveModelConfig(next)
  },

  updateThemeColor: async (color) => {
    applyThemeColor(color)
    set({ themeColor: color })
    await patchSettings({ themeColor: color })
  },
}))
