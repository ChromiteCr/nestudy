import type { UserSkill } from '@/types'

/**
 * 技能的导入导出。
 *
 * 导出的**单份就是那份 SKILL.md 原文**，不加壳。这样导出去的文件可以直接扔进
 * `Skills` 仓库的 `skills/<category>/<name>/SKILL.md`，也能被 Claude Code 当插件 skill 加载——
 * 换成本应用的私有格式，就把一份可移植的东西降级成只有这里能用的东西了。
 *
 * 多份才需要一个信封（一个文件装不下多份 markdown），用 JSON 数组；
 * 导入时两种都认。
 */

export const SKILL_BUNDLE_VERSION = 1

/** 信封的类型标记。改名之前导出的包写的是旧值，导入时两个都认 */
export const SKILL_BUNDLE_KIND = 'nestudy-skills'
const LEGACY_BUNDLE_KIND = 'studynest-skills'

export interface SkillBundle {
  kind: typeof SKILL_BUNDLE_KIND | typeof LEGACY_BUNDLE_KIND
  version: number
  exportedAt: number
  skills: { name: string; text: string }[]
}

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 单份导出：文件名用 skill 名，内容是原样的 SKILL.md */
export function downloadSkillMarkdown(skill: { name: string; text: string }): void {
  download(`${skill.name}.md`, skill.text, 'text/markdown')
}

export function downloadSkillBundle(skills: UserSkill[]): void {
  const bundle: SkillBundle = {
    kind: SKILL_BUNDLE_KIND,
    version: SKILL_BUNDLE_VERSION,
    exportedAt: Date.now(),
    skills: skills.map((s) => ({ name: s.name, text: s.text })),
  }
  const date = new Date().toISOString().slice(0, 10)
  download(`nestudy-skills-${date}.json`, JSON.stringify(bundle, null, 2), 'application/json')
}

export interface ImportedSkillText {
  /** 仅用于报错定位，真正的名字以解析 frontmatter 为准 */
  label: string
  text: string
}

/**
 * 把一个文件读成若干份 SKILL.md 原文。
 *
 * 只负责拆信封，不做校验——校验统一在 skillStore.saveSkill 里做，
 * 那样"AI 写的"和"从文件导入的"走同一道关口。
 */
export async function readSkillFile(file: File): Promise<{ skills: ImportedSkillText[]; errors: string[] }> {
  const text = await file.text()

  if (file.name.toLowerCase().endsWith('.json')) {
    try {
      const parsed = JSON.parse(text) as Partial<SkillBundle>
      const known = parsed.kind === SKILL_BUNDLE_KIND || parsed.kind === LEGACY_BUNDLE_KIND
      if (!known || !Array.isArray(parsed.skills)) {
        return { skills: [], errors: [`${file.name} 不是技能包文件`] }
      }
      if (typeof parsed.version === 'number' && parsed.version > SKILL_BUNDLE_VERSION) {
        return { skills: [], errors: [`${file.name} 来自更新的版本（v${parsed.version}），这个版本读不了`] }
      }
      const skills = parsed.skills
        .filter((s) => typeof s?.text === 'string' && s.text.trim())
        .map((s) => ({ label: String(s.name ?? file.name), text: s.text }))
      return skills.length > 0
        ? { skills, errors: [] }
        : { skills: [], errors: [`${file.name} 里没有可用的技能`] }
    } catch {
      return { skills: [], errors: [`${file.name} 不是合法的 JSON`] }
    }
  }

  if (!text.trim()) return { skills: [], errors: [`${file.name} 是空的`] }
  return { skills: [{ label: file.name, text }], errors: [] }
}
