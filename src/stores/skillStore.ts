import { create } from 'zustand'
import {
  addUserSkill,
  deleteUserSkill,
  getUserSkillByName,
  listUserSkills,
  updateUserSkill,
} from '@/lib/db/user-skills'
import { listBuiltinSkills, setUserSkills, type LoadedSkill } from '@/lib/skills'
import { parseSkillMarkdown } from '@/lib/skills/parser'
import type { UserSkill, UserSkillOrigin } from '@/types'

/**
 * 自建 / 导入 skill 的状态。
 *
 * 每次增删改之后都要 `setUserSkills` 把最新一批灌回 `lib/skills` 的模块缓存——
 * 那里是 `listSkills()` 的单一出口，system prompt、斜杠命令、能力收窄全靠它。
 * 忘了这一步就会出现"存进去了但 agent 看不见"。
 */

export interface SaveSkillResult {
  ok: boolean
  /** 失败原因（解析错误或重名），逐条给用户看 */
  errors: string[]
  skill?: UserSkill
}

interface SkillState {
  userSkills: UserSkill[]
  /** 解析后的自建 skill，界面渲染用（`listSkills()` 那份缓存对 React 不可见） */
  loadedSkills: LoadedSkill[]
  /** 自建 skill 的解析问题，技能库页面要摊开给用户看 */
  issues: { errors: string[]; warnings: string[] }
  loaded: boolean

  load: () => Promise<void>
  /** 存一份 SKILL.md 原文；`replaceId` 有值时覆盖那一条 */
  saveSkill: (text: string, origin: UserSkillOrigin, replaceId?: string) => Promise<SaveSkillResult>
  removeSkill: (id: string) => Promise<void>
}

/** 解析 + 查重，写库之前的统一关口 */
async function validate(text: string, replaceId?: string): Promise<{ name: string; errors: string[] }> {
  const result = parseSkillMarkdown({ text, origin: 'user', source: '这份 SKILL.md' })
  if (!result.skill) return { name: '', errors: result.errors }

  const name = result.skill.manifest.name
  if (listBuiltinSkills().some((s) => s.manifest.name === name)) {
    return { name, errors: [`名字「${name}」和内置技能重复了，换一个再存。`] }
  }
  const existing = await getUserSkillByName(name)
  if (existing && existing.id !== replaceId) {
    return { name, errors: [`已经有一个叫「${name}」的技能了。改名，或者去技能库里覆盖那一条。`] }
  }
  return { name, errors: [] }
}

export const useSkillStore = create<SkillState>((set, get) => {
  const refresh = async () => {
    const userSkills = await listUserSkills()
    const outcome = setUserSkills(userSkills.map((s) => ({ id: s.id, name: s.name, text: s.text })))
    set({ userSkills, loadedSkills: outcome.skills, issues: { errors: outcome.errors, warnings: outcome.warnings } })
  }

  return {
    userSkills: [],
    loadedSkills: [],
    issues: { errors: [], warnings: [] },
    loaded: false,

    load: async () => {
      await refresh()
      set({ loaded: true })
    },

    saveSkill: async (text, origin, replaceId) => {
      const { name, errors } = await validate(text, replaceId)
      if (errors.length > 0) return { ok: false, errors }

      let skill: UserSkill
      if (replaceId) {
        await updateUserSkill(replaceId, { name, text })
        skill = { ...get().userSkills.find((s) => s.id === replaceId)!, name, text, updatedAt: Date.now() }
      } else {
        skill = await addUserSkill({ name, text, origin })
      }
      await refresh()
      return { ok: true, errors: [], skill }
    },

    removeSkill: async (id) => {
      await deleteUserSkill(id)
      await refresh()
    },
  }
})
