import type { AskOption, AskQuestion } from '@/types'
import type { AskOutcome, Capability } from '../types'

/**
 * 带选项的提问。
 *
 * 解决的是一个很具体的毛病：skill 跑起来之后一轮问一句，
 * 而且每一句都叫「最后一个问题」。学生要来回敲五六次字才等到产出。
 *
 * 三条设计约束，都是针对那个毛病来的：
 *
 * 1. **一次问完**：一张卡最多 {@link MAX_QUESTIONS} 问，多的直接砍掉并告诉模型
 *    「剩下的自己按默认假设定，别再问」。砍在代码里而不是只写进提示词——
 *    提示词管不住的东西就得由运行时管。
 * 2. **给选项**：选择题比开放题好答得多，也顺带逼模型把问题想清楚：
 *    列不出三个像样选项的问题，多半是它自己没想明白该问什么。
 * 3. **可以不答**：每题都带「其他」（自己写），整张卡还能跳过。
 *    选项是脚手架不是围栏，学生的真实情况不该被四个选项框死。
 *
 * 与 propose 的区别在**停机**：出了这张卡，本次运行就结束，等人。
 * 答案以一条普通用户消息回到对话里，不走 tool 结果——
 * 那样历史序列永远合法（不会留下悬空的 tool_call），刷新、压缩、
 * 中途改口说别的，三种情况都不用特判。
 */

/** 一张卡最多几问。4 是「一屏答得完」与「够问清楚」的折中，同 Claude Code 的 AskUserQuestion */
export const MAX_QUESTIONS = 4
/** 每问最多几个选项，「其他」不计入 */
export const MAX_OPTIONS = 4

function parseOptions(raw: unknown): AskOption[] {
  if (!Array.isArray(raw)) return []
  const out: AskOption[] = []
  for (const item of raw) {
    const label = typeof item === 'string' ? item : String((item as AskOption)?.label ?? '').trim()
    if (!label) continue
    const description =
      typeof item === 'object' && item !== null ? String((item as AskOption).description ?? '').trim() : ''
    if (out.some((o) => o.label === label)) continue
    out.push(description ? { label, description } : { label })
    if (out.length >= MAX_OPTIONS) break
  }
  return out
}

export function parseAskArgs(rawArgs: string): AskOutcome {
  const args = JSON.parse(rawArgs || '{}') as { questions?: unknown }
  const raw = Array.isArray(args.questions) ? args.questions : []
  const notes: string[] = []
  const questions: AskQuestion[] = []

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const q = item as Record<string, unknown>
    const question = String(q.question ?? '').trim()
    const options = parseOptions(q.options)
    // 一个选项的"选择题"不是选择题，也没法答；丢掉比展示一张残卡好
    if (!question || options.length < 2) {
      if (question) notes.push(`「${question}」选项不足两个，已丢弃`)
      continue
    }
    if (questions.length >= MAX_QUESTIONS) {
      notes.push(`「${question}」超出一张卡 ${MAX_QUESTIONS} 问的上限，未展示`)
      continue
    }
    questions.push({
      header: String(q.header ?? '').trim() || question.slice(0, 6),
      question,
      multiSelect: q.multiSelect === true,
      options,
    })
  }

  if (questions.length === 0) return { request: null, notes }
  return { request: { questions, status: 'pending' }, notes }
}

export const askUserCapability: Capability = {
  name: 'ask_user',
  kind: 'ask',
  label: '请学生选择',
  describeCall: (rawArgs) => {
    try {
      const { questions } = JSON.parse(rawArgs || '{}') as { questions?: unknown[] }
      const count = Array.isArray(questions) ? questions.length : 0
      return count > 1 ? `请学生选择（${count} 问）` : undefined
    } catch {
      return undefined
    }
  },
  summary: '一次性提出最多 4 个带选项的问题，等学生在卡片上选完再继续',
  owner: 'core',
  schema: {
    name: 'ask_user',
    description:
      `一次性向学生提出最多 ${MAX_QUESTIONS} 个**带选项的**问题，然后停下等他在卡片上选。` +
      '\n\n什么时候用：你已经把能做的都做了，只剩下一两个**必须由学生本人决定**的岔路口——他每天真正能拿出多少时间、几件事里先做哪件、某段经历是不是同一件事。' +
      '\n\n什么时候不要用：' +
      '\n- 信息能从工具读到（先去读，别问）' +
      '\n- 你能给出一个合理默认值（**直接按默认值做出来**，在正文里写明假设，让他看着实物纠正；这比让他凭空回答问题准得多）' +
      '\n- 只是想确认「要不要保存」（想清楚了就直接出提案卡，卡片本身就是确认）' +
      '\n\n用法：把所有要问的一次问完，不要一轮问一句。每问给 2–4 个具体选项（「1 小时以内」好过「较少」），卡片会自动附带「其他（自己写）」和整张跳过，所以不必自己加这类选项。' +
      '\n\n调用之后本次回答即结束，学生的选择会以下一条消息回来。不要在同一轮里既提问又出提案卡。',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: `要问的问题，最多 ${MAX_QUESTIONS} 个。超出的不会展示。`,
          items: {
            type: 'object',
            properties: {
              header: { type: 'string', description: '极短标签，不超过 6 个字，如「每天时间」' },
              question: { type: 'string', description: '完整问题，一句话' },
              multiSelect: { type: 'boolean', description: '可多选则为 true，缺省单选' },
              options: {
                type: 'array',
                description: `2–${MAX_OPTIONS} 个具体选项。不要加「其他」，卡片自带。`,
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: '选项文字，尽量短且具体' },
                    description: { type: 'string', description: '可选：选了会怎样，一句话' },
                  },
                  required: ['label'],
                },
              },
            },
            required: ['question', 'options'],
          },
        },
      },
      required: ['questions'],
    },
  },
  ask: parseAskArgs,
}
