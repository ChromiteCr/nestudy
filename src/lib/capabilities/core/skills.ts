import { getSkill, listSkills } from '@/lib/skills'
import type { Capability } from '../types'

/**
 * 渐进式披露（progressive disclosure）的第二级。
 *
 * 三级模型：
 * 1. **发现**：system prompt 里只有每个 skill 的 name + description（几十 token 一个），
 *    装再多 skill 也不占上下文
 * 2. **激活**：模型判断哪个 skill 对得上，调 read_skill 把正文读进来（这一步）
 * 3. **执行**：按正文里的流程干活，只调该 skill 声明的能力
 *
 * S8 是把整段正文塞进 system prompt——只装了一个 skill 时看不出问题，
 * 装十个就等于每次对话先付十份说明书的钱，而且用户必须先手动选对那个。
 *
 * 读取本身是一次**工具调用**，因此它在对话里是可见的、可回放的：
 * 用户看得到 agent 在什么时候决定用哪个 skill，模型下一轮也还记得读过什么。
 */

/** 执行器靠这个前缀识别"这一轮读进来的是哪个 skill"，据此收窄后续轮次的能力面 */
export const SKILL_LOADED_MARKER = '@@skill-loaded:'

export const readSkillCapability: Capability = {
  name: 'read_skill',
  kind: 'read',
  summary: '读取某个 skill 的完整定义；读了之后就按它的流程与边界工作',
  owner: 'core',
  alwaysGranted: true,
  schema: {
    name: 'read_skill',
    description:
      '读取一个 skill 的完整定义。系统提示里只给了每个 skill 的名字和用途；当用户的请求对得上某个 skill、或用户用 /<skill-name> 明确点名时，**先调用它把定义读进来再动手**，不要凭名字猜它的流程。读取后你的可用工具会收窄到该 skill 声明的范围，这是正常的。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'skill 的 name（kebab-case，见系统提示里的清单）' },
      },
      required: ['name'],
    },
  },
  execute: async (rawArgs) => {
    let name = ''
    try {
      const args = JSON.parse(rawArgs || '{}') as { name?: unknown }
      name = typeof args.name === 'string' ? args.name.trim() : ''
    } catch {
      return JSON.stringify({ error: '参数不是合法 JSON' })
    }

    const skill = name ? getSkill(name) : undefined
    if (!skill) {
      return JSON.stringify({
        error: `没有名为「${name}」的 skill`,
        available: listSkills().map((s) => s.manifest.name),
      })
    }

    const { manifest, body } = skill
    const header = [
      `# skill: ${manifest.name}（${manifest.displayName}） v${manifest.version}`,
      manifest.readOnly
        ? '声明的能力：未声明，按只读运行——不要尝试提出任何写入提案。'
        : `声明的能力：${manifest.capabilities.join('、')}${manifest.optionalCapabilities.length ? `（可选：${manifest.optionalCapabilities.join('、')}）` : ''}`,
      '以下是它的完整定义，按其中的流程与边界工作。与通用规范冲突时以它为准，但"不直接写库、不代写"两条不可越过。',
    ].join('\n')

    // 尾行给执行器读，不是给模型读的；模型看到也无妨
    return `${header}\n\n---\n\n${body}\n\n${SKILL_LOADED_MARKER}${manifest.name}`
  },
}
