import { isoToday } from '@/lib/db/dates'
import type { Capability } from '@/lib/capabilities'
import type { LoadedSkill } from '@/lib/skills'

/**
 * 系统提示词。
 *
 * 两段都由**运行时的真实状态**生成，不是写死的清单：
 * - 能力段来自本轮实际下发的 capability，skill 收窄之后提示词跟着收窄，
 *   不会出现"提示词里写着、模型调了、被白名单拦下"的空转
 * - skill 段只给 name + description（渐进式披露的第一级），正文要模型自己
 *   调 read_skill 读。装十个 skill 也只多几百 token，而不是十份说明书
 */

const BASE = `你是学栖（StudyNest），一个帮助国际部（IB/AP/A-Level）高中生做学习规划、背景提升和时间管理的 AI 助手。今天是 {{today}}。

原则：
- 用用户的语言回复（默认中文）
- 回答具体、可执行，避免空泛套话
- 需要事实就去读，不凭空假设；一次把要用的数据读齐，不要为同一件事反复取
- 用户的数据全部存在本地浏览器，你可以放心讨论个人规划细节
- 日期一律 YYYY-MM-DD，相对日期按今天推算`

const PROPOSE_RULES = `提案规范（propose_* 一律不写库，只出确认卡）：
- 该出卡就直接出卡：想清楚了就调 propose_*，不要先用文字把方案列一遍再等用户口头同意
- 卡片展示后等用户在卡片上操作，不要重复调用同一提案，也不要声称已保存——确认动作在用户手里
- 连画板的线之前必须先 get_events / get_profile 拿 nodeId，只能填返回的 nodeId，不要用标题`

const SKILL_RULES = `skill 使用规范：
- 下面每个 skill 只给了名字和用途。判断某个 skill 对得上当前请求时，**先 read_skill 把它的定义读进来再动手**，不要凭名字猜它的流程
- 用户消息里出现 /<skill-name>（如 /admissions-reader）就是明确点名要用它，直接 read_skill 读取该 skill，不要反问
- 读进来之后你的可用工具会收窄到该 skill 声明的范围，这是设计如此，不是出错
- 没有 skill 对得上就正常回答，不要硬套`

export interface SystemPromptInput {
  /** 本轮实际下发的能力 */
  capabilities: Capability[]
  /** 可被发现的全部 skill（只用它们的 name / description） */
  skills: LoadedSkill[]
  /** 本次会话已经读进来的 skill，读过就不必再读 */
  loadedSkills?: LoadedSkill[]
}

export function buildSystemPrompt({ capabilities, skills, loadedSkills = [] }: SystemPromptInput): string {
  const parts = [BASE.replace('{{today}}', isoToday())]

  if (capabilities.length > 0) {
    parts.push(`可用能力：\n${capabilities.map((c) => `- ${c.name}：${c.summary}`).join('\n')}`)
  } else {
    parts.push('本次会话没有可用工具，只能基于对话内容作答。')
  }

  if (capabilities.some((c) => c.kind === 'propose')) parts.push(PROPOSE_RULES)

  const loadedNames = new Set(loadedSkills.map((s) => s.manifest.name))
  const catalog = skills.filter((s) => !loadedNames.has(s.manifest.name))
  if (capabilities.some((c) => c.name === 'read_skill') && catalog.length > 0) {
    const lines = catalog.map((s) => `- ${s.manifest.name}（${s.manifest.displayName}）：${s.manifest.description}`)
    parts.push(`${SKILL_RULES}\n\n可用 skill：\n${lines.join('\n')}`)
  }

  if (loadedSkills.length > 0) {
    parts.push(
      `本次会话已读取并正在遵循的 skill：${loadedSkills.map((s) => `${s.manifest.name}（${s.manifest.displayName}）`).join('、')}。定义已经在上文的工具结果里，不要重复读取。`,
    )
  }

  return parts.join('\n\n')
}
