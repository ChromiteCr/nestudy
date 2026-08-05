import bundle from '@/generated/skills.json'
import { parseSkillMarkdown } from './parser'
import type { LoadedSkill } from './types'

/**
 * skill 的加载入口，合并两个来源：
 *
 * - **内置**：`src/generated/skills.json` 由 `npm run skills:sync` 从 `Skills` 仓库采集，
 *   里面是原样的 SKILL.md 文本
 * - **自建 / 导入**：学生自己写的或导进来的，存在 IndexedDB，由 skillStore 在启动时灌进来
 *
 * 两者走**同一个解析器**。自建 skill 是纯文本、没有构建期校验保护，
 * 与 S12 商店安装的 skill 是同一类东西，所以校验必须在运行时。
 *
 * `listSkills()` 保持同步：它被 system prompt 组装、斜杠命令、多处界面同步调用，
 * 改成异步会一路传染。用户 skill 因此走"模块级缓存 + store 启动时注入"这条路，
 * 与 planningStore 在启动时加载数据是同一套做法。
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

const builtins = loadBuiltins()

// 解析失败的 skill 直接不进列表，但要留下痕迹——静默吞掉会让作者以为写对了
if (import.meta.env.DEV) {
  for (const message of builtins.errors) console.error('[skills]', message)
  for (const message of builtins.warnings) console.warn('[skills]', message)
}

let userLoaded: LoadOutcome = { skills: [], errors: [], warnings: [] }

/**
 * 解析并接纳一批用户 skill 原文。skillStore 在启动与每次增删改之后调用。
 *
 * 把解析结果**返回**给调用方，而不是只写进模块缓存：界面要按它渲染，
 * 而模块缓存对 React 是不可见的依赖——组件没法知道它什么时候变了。
 * 运行时侧继续读缓存（`listSkills()` 必须同步），界面侧读 store 里这份拷贝。
 */
export function setUserSkills(entries: { id: string; name: string; text: string }[]): LoadOutcome {
  const skills: LoadedSkill[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const builtinNames = new Set(builtins.skills.map((s) => s.manifest.name))

  for (const entry of entries) {
    const result = parseSkillMarkdown({ text: entry.text, origin: 'user', source: `我的技能/${entry.name}` })
    errors.push(...result.errors)
    warnings.push(...result.warnings)
    if (!result.skill) continue
    // 与内置重名时内置优先：白名单是按名字判的，让自建的顶掉内置等于
    // 用户以为在跑官方 skill、实际跑的是另一份文本
    if (builtinNames.has(result.skill.manifest.name)) {
      errors.push(`我的技能/${entry.name}：与内置 skill 重名，已忽略。改个名字再存。`)
      continue
    }
    skills.push({ ...result.skill, userSkillId: entry.id })
  }

  userLoaded = { skills, errors, warnings }
  return userLoaded
}

/** 生成物的来源，界面展示用（哪个 Skills 仓库版本打包进来的） */
export const SKILLS_SOURCE = bundle.source

export function listSkills(): LoadedSkill[] {
  return [...builtins.skills, ...userLoaded.skills]
}

export function listBuiltinSkills(): LoadedSkill[] {
  return builtins.skills
}

export function listUserLoadedSkills(): LoadedSkill[] {
  return userLoaded.skills
}

export function getSkill(name: string): LoadedSkill | undefined {
  return listSkills().find((s) => s.manifest.name === name)
}

export function listSkillLoadIssues(): { errors: string[]; warnings: string[] } {
  return {
    errors: [...builtins.errors, ...userLoaded.errors],
    warnings: [...builtins.warnings, ...userLoaded.warnings],
  }
}

export * from './types'
