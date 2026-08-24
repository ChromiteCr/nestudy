import { db } from './index'
import { newId } from './repositories'
import type { UserSkill, UserSkillOrigin, UserSkillSource } from '@/types'

/** 自建 / 导入 skill 的读写。存的是完整 SKILL.md 原文，解析交给统一的解析器。 */

export async function listUserSkills(): Promise<UserSkill[]> {
  return db.userSkills.orderBy('updatedAt').reverse().toArray()
}

export async function getUserSkillByName(name: string): Promise<UserSkill | undefined> {
  return db.userSkills.where('name').equals(name).first()
}

export async function addUserSkill(input: {
  name: string
  text: string
  origin: UserSkillOrigin
  source?: UserSkillSource
}): Promise<UserSkill> {
  const now = Date.now()
  const skill: UserSkill = { ...input, id: newId(), createdAt: now, updatedAt: now }
  await db.userSkills.add(skill)
  return skill
}

export async function updateUserSkill(
  id: string,
  patch: { name?: string; text: string; source?: UserSkillSource },
): Promise<void> {
  await db.userSkills.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteUserSkill(id: string): Promise<void> {
  await db.userSkills.delete(id)
}
