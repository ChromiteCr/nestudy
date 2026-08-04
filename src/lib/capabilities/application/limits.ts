import { COMMON_APP_ACTIVITY_LIMITS, SCHOOL_REFERENCE } from './reference'
import { checkField, formCharCount, paragraphCount, visualCharCount, wordCount } from './text-metrics'
import type { Capability } from '../types'

/**
 * 数字符与数词。
 *
 * 这两个是 S9 判据最硬的例子：**LLM 数不准字符数**。中英混排更糟，
 * 因为模型看到的是 token 不是字符。所以这件事必须是代码算，模型只负责改文案。
 */

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs?.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// ---- check_activity_limits ----

interface RawActivity {
  position?: unknown
  organization?: unknown
  description?: unknown
}

export const checkActivityLimitsCapability: Capability = {
  name: 'check_activity_limits',
  kind: 'read',
  label: '数活动栏字符',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const n = Array.isArray(args.activities) ? args.activities.length : 0
    return n > 0 ? `数 ${n} 条活动的字符数` : undefined
  },
  summary: '按 Common App 活动栏限额逐条核字符数（职位 50 / 组织 100 / 描述 150）',
  owner: 'core',
  schema: {
    name: 'check_activity_limits',
    description: `按 Common App 活动栏的字符限额逐条核对：职位 ${COMMON_APP_ACTIVITY_LIMITS.position} / 组织 ${COMMON_APP_ACTIVITY_LIMITS.organization} / 描述 ${COMMON_APP_ACTIVITY_LIMITS.description} 字符，最多 ${COMMON_APP_ACTIVITY_LIMITS.maxActivities} 条。**你自己数不准字符数，改完每一版都要重新调这个工具核一遍**，不要凭感觉说"这样应该就在限制内了"。返回里 used 是表单实际扣的格数，visible 是肉眼看到的字符数，两者不等说明文案里有占 2 格的字符（多半是 emoji）。`,
    parameters: {
      type: 'object',
      properties: {
        activities: {
          type: 'array',
          description: '要核对的活动条目，字段留空表示这条不填',
          items: {
            type: 'object',
            properties: {
              position: { type: 'string', description: 'Position/Leadership description' },
              organization: { type: 'string', description: 'Organization Name' },
              description: { type: 'string', description: 'Please describe this activity' },
            },
            required: [],
          },
        },
      },
      required: ['activities'],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const raw: RawActivity[] = Array.isArray(args.activities) ? (args.activities as RawActivity[]) : []

    const activities = raw.map((a, i) => {
      const fields = [
        { name: 'position', value: str(a.position), limit: COMMON_APP_ACTIVITY_LIMITS.position },
        { name: 'organization', value: str(a.organization), limit: COMMON_APP_ACTIVITY_LIMITS.organization },
        { name: 'description', value: str(a.description), limit: COMMON_APP_ACTIVITY_LIMITS.description },
      ]
        .filter((f) => f.value.trim() !== '')
        .map((f) => checkField(f.name, f.value, f.limit))
      return { index: i + 1, fields, over: fields.filter((f) => f.over).map((f) => f.field) }
    })

    const overCount = activities.filter((a) => a.over.length > 0).length
    const warnings: string[] = []
    if (raw.length > COMMON_APP_ACTIVITY_LIMITS.maxActivities) {
      warnings.push(
        `一共 ${raw.length} 条，Common App 只有 ${COMMON_APP_ACTIVITY_LIMITS.maxActivities} 个槽位，要先砍到 ${COMMON_APP_ACTIVITY_LIMITS.maxActivities} 条以内`,
      )
    }
    if (overCount > 0) warnings.push(`${overCount} 条超限，逐条按 remaining 的负数削字`)

    return JSON.stringify({
      dataVersion: SCHOOL_REFERENCE.version,
      limits: COMMON_APP_ACTIVITY_LIMITS,
      counting: '限额按字符数，不是词数；口径同 HTML maxlength（UTF-16 code unit），emoji 一般占 2 格',
      activities,
      summary: { total: raw.length, over: overCount },
      warnings,
    })
  },
}

// ---- count_essay_words ----

interface RawEssay {
  label?: unknown
  text?: unknown
  wordLimit?: unknown
  charLimit?: unknown
  minWords?: unknown
}

export const countEssayWordsCapability: Capability = {
  name: 'count_essay_words',
  kind: 'read',
  label: '数文书词数',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const list = Array.isArray(args.essays) ? (args.essays as RawEssay[]) : []
    if (list.length === 1) {
      const label = str(list[0]?.label).trim()
      return label ? `数「${label}」的词数` : '数文书词数'
    }
    return list.length > 1 ? `数 ${list.length} 篇文书的词数` : undefined
  },
  summary: '统计文书词数 / 字符数 / 段落数，对照给定的上限',
  owner: 'core',
  schema: {
    name: 'count_essay_words',
    description:
      '统计文书的词数、字符数与段落数，并对照上限。**你自己数不准，每改一版都要重新调这个工具核**。上限用 wordLimit / charLimit 传进来；不知道某个平台或学校的上限就先调 get_school_requirements 查（Common App 主文书 650 词、UC PIQ 每题 350 词、UCAS 三题合计 4000 字符）。英文按空白分词，中日韩逐字计。',
    parameters: {
      type: 'object',
      properties: {
        essays: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '这是哪一篇，便于对上号' },
              text: { type: 'string', description: '正文' },
              wordLimit: { type: 'number', description: '词数上限，没有就省略' },
              charLimit: { type: 'number', description: '字符数上限（UCAS 这类按字符算的用它）' },
              minWords: { type: 'number', description: '词数下限，如 Common App 主文书 250' },
            },
            required: ['text'],
          },
        },
      },
      required: ['essays'],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const raw: RawEssay[] = Array.isArray(args.essays) ? (args.essays as RawEssay[]) : []

    const essays = raw.map((e, i) => {
      const text = str(e.text).trim()
      const words = wordCount(text)
      const chars = formCharCount(text)
      const visible = visualCharCount(text)
      const wordLimit = typeof e.wordLimit === 'number' ? e.wordLimit : undefined
      const charLimit = typeof e.charLimit === 'number' ? e.charLimit : undefined
      const minWords = typeof e.minWords === 'number' ? e.minWords : undefined

      const issues: string[] = []
      if (wordLimit !== undefined && words > wordLimit) issues.push(`超出词数上限 ${words - wordLimit} 词`)
      if (charLimit !== undefined && chars > charLimit) issues.push(`超出字符上限 ${chars - charLimit} 字符`)
      if (minWords !== undefined && words < minWords) issues.push(`不足下限，还差 ${minWords - words} 词`)

      return {
        index: i + 1,
        label: str(e.label) || `第 ${i + 1} 篇`,
        words,
        chars,
        visibleChars: visible,
        paragraphs: paragraphCount(text),
        wordLimit,
        charLimit,
        minWords,
        wordsRemaining: wordLimit !== undefined ? wordLimit - words : undefined,
        charsRemaining: charLimit !== undefined ? charLimit - chars : undefined,
        ok: issues.length === 0,
        issues,
      }
    })

    return JSON.stringify({
      counting: {
        words: '英文按空白切分且必须含字母或数字；中日韩逐字计（与 Word 同口径）',
        chars: '按 UTF-16 code unit，与网页表单的 maxlength 一致；emoji 一般占 2 格',
      },
      essays,
      summary: { total: essays.length, withIssues: essays.filter((e) => !e.ok).length },
    })
  },
}
