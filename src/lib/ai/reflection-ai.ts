import { getOpenAIClient } from './graph-ai'
import type { ReflectionQA } from '@/types'

/** STAR 式采访模板：固定 6 题 */
export const REFLECTION_TEMPLATE: string[] = [
  '这段经历里，你具体做了什么？',
  '你在其中扮演的角色或承担的部分是什么？',
  '过程中遇到的最大挑战是什么？',
  '这段经历让你学到了什么、有什么收获？',
  '它和你其他的经历、方向有什么联系吗？',
  '接下来打算怎么继续或延伸这段经历？',
]

function stripQuotes(s: string): string {
  return s.trim().replace(/^["“]|["”]$/g, '')
}

/**
 * 判断某题回答后是否需要追问一个细节；不需要则返回 null。
 * 调用方负责控制每题最多调用几次（避免无限追问）。
 */
export async function pickFollowUp(
  qaSoFar: ReflectionQA[],
  currentQuestion: string,
  currentAnswer: string,
): Promise<string | null> {
  const { openai, model } = getOpenAIClient()
  const history = qaSoFar.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')
  const res = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          '你在帮国际部学生做一次反思采访。刚问完一题，判断学生的回答是否值得追问一个更具体的细节（比如说得笼统、缺了具体的例子或数字、或者提到了一个值得展开的点）。如果值得追问，只输出这一个追问问题本身（中文，不超过 30 字，不要编号不要引号）；如果不需要追问，只输出 NONE。不要输出其他任何内容。',
      },
      {
        role: 'user',
        content: `已有问答：\n${history || '（无）'}\n\n刚问的问题：${currentQuestion}\n学生回答：${currentAnswer}`,
      },
    ],
  })
  const text = stripQuotes(res.choices[0]?.message?.content ?? 'NONE')
  return text.toUpperCase() === 'NONE' || !text ? null : text
}

/** 判断自由草稿覆盖了模板中的哪些问题（返回下标数组，0-based），未覆盖的题目之后再逐一补问 */
export async function coverageFromDraft(draft: string): Promise<number[]> {
  const { openai, model } = getOpenAIClient()
  const list = REFLECTION_TEMPLATE.map((q, i) => `${i}. ${q}`).join('\n')
  const res = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `下面是反思采访模板的 6 个问题：\n${list}\n\n学生已经自己写了一段草稿。判断草稿实质性覆盖了哪几题（不要求逐字对应，只要内容触及即可），只输出 JSON 数组，形如 [0,2,4]，没有覆盖任何题就输出 []，不要输出其他内容。`,
      },
      { role: 'user', content: draft },
    ],
  })
  const text = res.choices[0]?.message?.content ?? '[]'
  try {
    const jsonStr = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
    const parsed: unknown = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is number => typeof n === 'number' && n >= 0 && n < REFLECTION_TEMPLATE.length)
  } catch {
    return []
  }
}

export interface ReflectionSummaryResult {
  summary: string
  edges: { targetLabel: string; reason: string; strength: number }[]
}

/** 采访结束后：生成总结 + 可能的叙事线连接建议 */
export async function generateReflectionSummary(input: {
  qa: ReflectionQA[]
  activityTitle?: string
  otherLabels: string[]
}): Promise<ReflectionSummaryResult> {
  const { openai, model } = getOpenAIClient()
  const history = input.qa.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')
  const context = input.activityTitle
    ? `这次反思关联的活动是「${input.activityTitle}」。`
    : '这是一次独立的反思，不关联具体活动。'
  const labelsHint = input.otherLabels.length
    ? `学生已有的其他活动/课程/专业方向节点标题：${input.otherLabels.join('、')}。如果反思内容明确提到了与其中某个的联系，在 edges 里给出建议（target 必须用完全一致的标题）；没有明确联系就给空数组。`
    : ''
  const res = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你在帮国际部学生整理一次反思采访的问答记录。${context}根据问答写一段 120-200 字的第一人称反思总结，中文，语气真诚具体，不要空话套话。${labelsHint}只输出 JSON，形如 {"summary":"...","edges":[{"target":"...","reason":"...","strength":3}]}，strength 为 1-5 整数，不要输出其他内容。`,
      },
      { role: 'user', content: history },
    ],
  })
  const text = res.choices[0]?.message?.content ?? '{}'
  const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  const parsed = JSON.parse(jsonStr) as {
    summary?: string
    edges?: { target?: string; reason?: string; strength?: number }[]
  }
  return {
    summary: (parsed.summary ?? '').trim(),
    edges: (parsed.edges ?? [])
      .filter((e) => e.target?.trim())
      .map((e) => ({
        targetLabel: e.target!.trim(),
        reason: e.reason ?? '',
        strength: typeof e.strength === 'number' ? Math.min(5, Math.max(1, Math.round(e.strength))) : 3,
      })),
  }
}
