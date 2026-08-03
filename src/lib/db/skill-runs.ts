import { db } from './index'
import { newId } from './repositories'
import type { SkillRun } from '@/types'

/**
 * Skill 运行记录。取代了 S5 的 `settings.usedSkillIds` 这个临时字段：
 * 那个只能回答"用没用过"，这张表还能回答"用了几次、跑了几轮、产出了什么"，
 * 是规则引擎主动建议与 S12 商店的共同依据。
 */

export async function listSkillRuns(): Promise<SkillRun[]> {
  return db.skillRuns.orderBy('startedAt').reverse().toArray()
}

export async function recordSkillRun(input: Omit<SkillRun, 'id'>): Promise<SkillRun> {
  const run: SkillRun = { ...input, id: newId() }
  await db.skillRuns.add(run)
  return run
}

/** 用过哪些 skill（规则引擎"从未用过"类建议的判据） */
export async function listUsedSkillNames(): Promise<string[]> {
  const names = await db.skillRuns.orderBy('skillName').uniqueKeys()
  return names.map(String)
}
