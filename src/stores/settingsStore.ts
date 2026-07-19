import { create } from 'zustand'
import { DEFAULT_MODEL_CONFIG, type ModelConfig } from '@/types'
import { getSettings, saveModelConfig } from '@/lib/db/repositories'

interface SettingsState {
  modelConfig: ModelConfig
  loaded: boolean
  load: () => Promise<void>
  updateModelConfig: (patch: Partial<ModelConfig>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  modelConfig: { ...DEFAULT_MODEL_CONFIG },
  loaded: false,

  load: async () => {
    const settings = await getSettings()
    set({ modelConfig: settings.modelConfig, loaded: true })
  },

  updateModelConfig: async (patch) => {
    const next = { ...get().modelConfig, ...patch }
    set({ modelConfig: next })
    await saveModelConfig(next)
  },
}))
