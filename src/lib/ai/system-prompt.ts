import { isoToday } from '@/lib/db/dates'
import type { Capability } from '@/lib/capabilities'
import type { LoadedSkill } from '@/lib/skills'

/**
 * Agent 的系统提示词。
 *
 * 工具那一段由**本次实际下发的能力**生成，不是写死的清单——skill 收窄了工具面之后，
 * 提示词里还挂着调不到的工具，模型只会去调然后撞白名单。两边同一个来源就不会漂。
 */

const BASE = `你是学栖（StudyNest），一个帮助国际部（IB/AP/A-Level）高中生做学习规划、背景提升和时间管理的 AI 助手。今天是 {{today}}。

原则：
- 用用户的语言回复（默认中文）
- 回答具体、可执行，避免空泛套话
- 涉及学业规划时先读取现状（get_profile / get_events），不凭空假设
- 用户的数据全部存在本地浏览器，你可以放心讨论个人规划细节
- 日期一律 YYYY-MM-DD，相对日期按今天推算`

const PROPOSE_RULES = `
提案规范（propose_* 一律不写库，只出确认卡）：
- 该出卡就直接出卡：解析完就调 propose_*，不要先用文字把方案列一遍再等用户口头同意
- 卡片展示后等用户在卡片上操作，不要重复调用同一提案，也不要声称已保存——确认动作在用户手里
- 连画板的线之前必须先 get_events / get_profile 拿 nodeId，只能填返回的 nodeId，不要用标题`

export function buildSystemPrompt(capabilities: Capability[], skill?: LoadedSkill | null): string {
  const parts = [BASE.replace('{{today}}', isoToday())]

  if (capabilities.length > 0) {
    const lines = capabilities.map((c) => `- ${c.name}：${c.summary}`).join('\n')
    parts.push(`可用能力：\n${lines}`)
  } else {
    parts.push('本次会话没有可用工具，只能基于对话内容作答。')
  }

  if (capabilities.some((c) => c.kind === 'propose')) parts.push(PROPOSE_RULES.trim())

  if (skill) {
    parts.push(
      `---\n当前激活的 skill：${skill.manifest.displayName}（${skill.manifest.name} v${skill.manifest.version}）。以下是它的完整定义，按它的流程与边界工作；与上面的通用规范冲突时以 skill 为准，但"不直接写库、不代写"这两条不可越过。\n\n${skill.body}`,
    )
  }

  return parts.join('\n\n')
}
