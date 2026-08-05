import { listCapabilities } from '../registry'
import { OUTPUT_LABEL, SKILL_OUTPUTS, MAX_ALLOWED_ROUNDS, DEFAULT_MAX_ROUNDS } from '@/lib/skills/types'
import { parseSkillMarkdown } from '@/lib/skills/parser'
import { listSkills } from '@/lib/skills'
import { useSkillStore } from '@/stores/skillStore'
import type { Proposal, ProposedSkill } from '@/types'
import type { Capability } from '../types'

/**
 * 让 agent 帮学生写 skill 的两个能力。
 *
 * 这一对是 S10b 的全部工具面：**读得到有哪些能力可声明**，**写得出一份能通过校验的 SKILL.md**。
 * 剩下的（问清楚要做什么流程、边界怎么定、正文怎么写）全在 `skill-creator` 的正文里，
 * 那是 prompt 的事，不该做成工具——判据还是 S9 那条。
 */

// ---- list_capabilities ----

export const listCapabilitiesCapability: Capability = {
  name: 'list_capabilities',
  kind: 'read',
  label: '查看可声明的能力',
  summary: '列出运行时全部能力的名字与用途，供撰写 SKILL.md 时声明',
  owner: 'core',
  schema: {
    name: 'list_capabilities',
    description:
      '列出这个运行时全部可用能力的名字、类别与用途。**写 SKILL.md 的 capabilities 之前必须先调用它**——能力名是运行时定义的，凭印象写会声明出一个不存在的名字，那个 skill 装上去就是坏的。返回里 kind=read 的是读取类（自动执行），kind=propose 的是提案类（出确认卡，用户点了才写库），kind=ask 的是提问类（出选择题卡片，然后停下等人答）。',
    parameters: { type: 'object', properties: {} },
  },
  execute: async () => {
    const caps = listCapabilities()
    return JSON.stringify({
      total: caps.length,
      capabilities: caps.map((c) => ({
        name: c.name,
        kind: c.kind,
        label: c.label,
        summary: c.summary,
      })),
      outputs: SKILL_OUTPUTS.map((o) => ({ value: o, label: OUTPUT_LABEL[o] })),
      rules: [
        '不写 capabilities 就是只读：运行时会给全部读能力与提问能力，一个写能力都不给。这是安全默认值。',
        '技能的默认姿势是**先做出成品**：缺信息按合理默认值做第一版并写明假设，别先问一轮再动手。要问就声明 ask_user，一次问完（最多 4 问，每问带选项），运行时对连续追问有硬上限。',
        '声明了 capabilities 就只拿到声明的那几个，多一个都没有。写多了不会更强，只会让用户看到不必要的授权。',
        'optional_capabilities 是"有更好、没有也能跑"的；必需的写进 capabilities。',
        `max_rounds 是多轮工具调用的上限，1-${MAX_ALLOWED_ROUNDS}，不写按 ${DEFAULT_MAX_ROUNDS}。访谈类流程要给够（50 以上），一问一答很吃轮数。`,
        'outputs 要和 capabilities 自洽：写了 document 就得有 propose_artifact，canvas 要 propose_canvas，event 要 propose_events。',
      ],
    })
  },
}

// ---- propose_skill ----

export function parseSkillArgs(rawArgs: string): ProposedSkill[] {
  const args = JSON.parse(rawArgs) as { skills?: { text?: unknown }[] }
  const existing = useSkillStore.getState().userSkills
  const builtinNames = new Set(listSkills().filter((s) => s.origin === 'builtin').map((s) => s.manifest.name))
  const out: ProposedSkill[] = []

  for (const raw of args.skills ?? []) {
    const text = typeof raw.text === 'string' ? raw.text.trim() : ''
    if (!text) continue

    // 用真解析器验，不另写一套宽松规则——装进去能不能跑，此刻就要知道
    const result = parseSkillMarkdown({ text, origin: 'user', source: '这份 SKILL.md' })
    const errors = [...result.errors]
    let manifest: ProposedSkill['manifest'] = null
    let replacesId: string | undefined

    if (result.skill) {
      const m = result.skill.manifest
      if (builtinNames.has(m.name)) {
        errors.push(`名字「${m.name}」和内置技能重复了，换一个`)
      } else {
        replacesId = existing.find((s) => s.name === m.name)?.id
        manifest = {
          name: m.name,
          displayName: m.displayName,
          description: m.description,
          category: m.category,
          capabilities: m.capabilities,
          outputs: m.outputs,
          maxRounds: m.maxRounds,
          readOnly: m.readOnly,
        }
      }
    }

    out.push({ include: errors.length === 0, text, manifest, errors, replacesId })
  }
  return out
}

export const proposeSkillCapability: Capability = {
  name: 'propose_skill',
  kind: 'propose',
  label: '整理出技能草稿',
  summary: '把写好的 SKILL.md 作为提案交给用户确认，确认后存进他的技能库',
  owner: 'core',
  schema: {
    name: 'propose_skill',
    description: `把写好的 SKILL.md 作为提案展示给用户确认（不会直接写入）。**text 要给完整的一份文件**：--- 包裹的 frontmatter + 正文，不要只给片段。必填键：name（kebab-case，与技能同名）、description、category、version（semver，新建从 0.1.0 起）、status（新建写 draft）、priority、compatible_agents。可选的运行时键：display_name、capabilities、optional_capabilities、outputs（${SKILL_OUTPUTS.join(' / ')}）、max_rounds、suggest_hint。**声明 capabilities 之前先调 list_capabilities**。已存在同名的自建技能时会变成覆盖，卡片上会写明。`,
    parameters: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: '完整的 SKILL.md 原文，含 --- frontmatter --- 与正文' },
            },
            required: ['text'],
          },
        },
      },
      required: ['skills'],
    },
  },
  parse: (rawArgs) => {
    const skills = parseSkillArgs(rawArgs)
    if (skills.length === 0) return null
    return { kind: 'skill', skills, status: 'pending' } satisfies Proposal
  },
}

export const AUTHORING_READ_CAPABILITIES: Capability[] = [listCapabilitiesCapability]
export const AUTHORING_PROPOSE_CAPABILITIES: Capability[] = [proposeSkillCapability]
