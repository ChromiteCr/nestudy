import bundle from '@/generated/skills.json'
import { parseSkillMarkdown } from './parser'
import type { LoadedSkill } from './types'

/**
 * 内置 skill 的加载入口。
 *
 * `src/generated/skills.json` 由 `npm run skills:sync` 从 `Skills` 仓库采集而来，
 * 里面是**原样的 SKILL.md 文本**——解析在这里做，和 S12 商店安装的 skill 走同一个解析器。
 */

interface LoadOutcome {
  skills: LoadedSkill[]
  errors: string[]
  warnings: string[]
}

function loadBuiltins(): LoadOutcome {
  const skills: LoadedSkill[] = []
  const errors: string[] = []
  const warnings: string[] = []
  for (const file of bundle.files) {
    const result = parseSkillMarkdown({ text: file.text, origin: 'builtin', source: file.path })
    errors.push(...result.errors)
    warnings.push(...result.warnings)
    if (result.skill) skills.push(result.skill)
  }
  return { skills, errors, warnings }
}

const loaded = loadBuiltins()

// 解析失败的 skill 直接不进列表，但要留下痕迹——静默吞掉会让作者以为写对了
if (import.meta.env.DEV) {
  for (const message of loaded.errors) console.error('[skills]', message)
  for (const message of loaded.warnings) console.warn('[skills]', message)
}

/** 生成物的来源，设置页展示用（哪个 Skills 仓库版本打包进来的） */
export const SKILLS_SOURCE = bundle.source

export function listSkills(): LoadedSkill[] {
  return loaded.skills
}

export function getSkill(name: string): LoadedSkill | undefined {
  return loaded.skills.find((s) => s.manifest.name === name)
}

export function listSkillLoadIssues(): { errors: string[]; warnings: string[] } {
  return { errors: loaded.errors, warnings: loaded.warnings }
}

export * from './types'
