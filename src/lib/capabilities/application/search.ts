import { listArtifacts } from '@/lib/db/artifacts'
import type { Artifact } from '@/types'
import type { Capability } from '../types'

/**
 * 学习资产的关键词检索——写文书时的**素材召回**。
 *
 * 与 get_artifacts 的分工：get_artifacts 是"按类别列出来"，这里是"翻找"。
 * 差别在于**命中片段**：文书写作要的不是"有 12 篇反思"，而是"这句话你两年前
 * 就说过，在哪篇里、原话是什么"。所以这里按相关度排序，并把命中处的上下文切出来。
 *
 * **不上向量检索**。本地嵌入是另一个课题（模型体积、索引维护、增量更新），
 * 而个人尺度的几百篇资产用关键词 + 标签已经能召回；等真的召不回了再说。
 */

const SNIPPET_RADIUS = 60
const MAX_SNIPPETS_PER_ARTIFACT = 3
const DEFAULT_LIMIT = 10

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs?.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

interface Hit {
  artifact: Artifact
  score: number
  matched: string[]
  snippets: string[]
}

function findSnippets(text: string, keyword: string): { count: number; snippets: string[] } {
  const haystack = text.toLowerCase()
  const needle = keyword.toLowerCase()
  const snippets: string[] = []
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    count++
    if (snippets.length < MAX_SNIPPETS_PER_ARTIFACT) {
      const start = Math.max(0, at - SNIPPET_RADIUS)
      const end = Math.min(text.length, at + needle.length + SNIPPET_RADIUS)
      snippets.push(`${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`)
    }
    from = at + needle.length
  }
  return { count, snippets }
}

export const searchArtifactsCapability: Capability = {
  name: 'search_artifacts',
  kind: 'read',
  label: '翻找历史素材',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const keywords = Array.isArray(args.keywords)
      ? (args.keywords as unknown[]).filter((k): k is string => typeof k === 'string')
      : []
    return keywords.length > 0 ? `翻找「${keywords.join(' ')}」相关的素材` : undefined
  },
  summary: '在历史反思与文档里按关键词翻找素材，按相关度返回命中片段',
  owner: 'core',
  schema: {
    name: 'search_artifacts',
    description:
      '在学生的历史学习资产（反思、复盘、文档、文书草稿）里按关键词检索，按相关度排序并给出命中处的上下文片段。写文书找素材时用——比 get_artifacts 更适合"他以前说过什么"这类问题。多个关键词默认命中任意一个即算（OR），要求全部命中就传 matchAll=true。**返回里的 takeaway 是他自己写下的「下次会怎么做」，是这批素材里分量最重的一句：写文书时优先用它，而且必须原样引用、不要转述成你的说法。**活动经历不在这里，在 get_events 里。',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: '关键词。中英文都可以，会同时搜标题、正文、标签、访谈问答与「下次会怎么做」',
        },
        matchAll: { type: 'boolean', description: '是否要求全部关键词都命中，默认 false' },
        kind: {
          type: 'string',
          enum: ['reflection', 'document', 'cheatsheet', 'plan', 'review', 'essay', 'code'],
          description: '限定资产类型',
        },
        since: { type: 'string', description: 'YYYY-MM-DD，只搜这天之后创建的' },
        limit: { type: 'number', description: `最多返回多少条，默认 ${DEFAULT_LIMIT}` },
      },
      required: ['keywords'],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const keywords = (Array.isArray(args.keywords) ? (args.keywords as unknown[]) : [])
      .filter((k): k is string => typeof k === 'string' && k.trim() !== '')
      .map((k) => k.trim())
    if (keywords.length === 0) return JSON.stringify({ error: 'keywords 不能为空' })

    const matchAll = args.matchAll === true
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 50) : DEFAULT_LIMIT
    const since = typeof args.since === 'string' ? Date.parse(`${args.since}T00:00:00`) : NaN

    let pool = await listArtifacts()
    if (typeof args.kind === 'string') pool = pool.filter((a) => a.kind === args.kind)
    if (!Number.isNaN(since)) pool = pool.filter((a) => a.createdAt >= since)

    const hits: Hit[] = []
    for (const artifact of pool) {
      const qaText = (artifact.qa ?? []).map((q) => `${q.question} ${q.answer}`).join('\n')
      const tagText = artifact.tags.join(' ')
      const takeaway = artifact.takeaway?.trim() ?? ''
      const matched: string[] = []
      const snippets: string[] = []
      let score = 0

      for (const keyword of keywords) {
        // 标题命中权重最高：学生给资产起的标题本来就是他自己的索引。
        // 「下次会怎么做」与标题同权——写文书时问的就是"他以前说过什么"，
        // 而这一句是全部记录里唯一一句他打算带走的话，命中它就是命中了要找的东西
        const inTitle = artifact.title.toLowerCase().includes(keyword.toLowerCase())
        const inTakeaway = takeaway.toLowerCase().includes(keyword.toLowerCase())
        const inTags = tagText.toLowerCase().includes(keyword.toLowerCase())
        const body = findSnippets(`${artifact.content}\n${qaText}`, keyword)
        if (!inTitle && !inTags && !inTakeaway && body.count === 0) continue
        matched.push(keyword)
        score += (inTitle ? 5 : 0) + (inTakeaway ? 5 : 0) + (inTags ? 3 : 0) + Math.min(body.count, 5)
        for (const s of body.snippets) if (snippets.length < MAX_SNIPPETS_PER_ARTIFACT) snippets.push(s)
      }

      if (matched.length === 0) continue
      if (matchAll && matched.length < keywords.length) continue
      // 多个关键词同时命中的，比单个词命中很多次的更值得看
      hits.push({ artifact, score: score + matched.length * 4, matched, snippets })
    }

    hits.sort((a, b) => b.score - a.score || b.artifact.createdAt - a.artifact.createdAt)

    return JSON.stringify({
      keywords,
      matchAll,
      searched: pool.length,
      total: hits.length,
      results: hits.slice(0, limit).map((h) => ({
        id: h.artifact.id,
        kind: h.artifact.kind,
        title: h.artifact.title,
        tags: h.artifact.tags,
        linkedNodeIds: h.artifact.linkedNodeIds,
        createdAt: new Date(h.artifact.createdAt).toISOString().slice(0, 10),
        matched: h.matched,
        // 原话整句给，不切片段——它只有一行，而切过的引文就不再是引文了
        takeaway: h.artifact.takeaway,
        snippets: h.snippets,
      })),
      note:
        '片段只是命中处的上下文。要某一条的全文，用 get_artifacts 传它的 id。' +
        'takeaway 是学生自己写下的「下次会怎么做」，是完整原话——引用时一个字都不要改。',
    })
  },
}
