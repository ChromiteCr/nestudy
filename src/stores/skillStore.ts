import { create } from 'zustand'
import { getSettings, patchSettings } from '@/lib/db/repositories'

/** 当前激活的 skill（chatStore 的 agent loop 据此注入人设 prompt + 收窄工具面） */
interface SkillState {
  activeSkillId: string | null
  setActiveSkill: (id: string | null) => void
}

export const useSkillStore = create<SkillState>((set) => ({
  activeSkillId: null,
  setActiveSkill: (id) => {
    set({ activeSkillId: id })
    if (id) void markSkillUsed(id)
  },
}))

async function markSkillUsed(id: string) {
  const settings = await getSettings()
  const used = new Set(settings.usedSkillIds ?? [])
  if (used.has(id)) return
  used.add(id)
  await patchSettings({ usedSkillIds: [...used] })
}
