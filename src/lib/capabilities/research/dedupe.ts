import type { Capability } from '../types'

/**
 * 检索结果去重。
 *
 * 头脑风暴时最耗时间的一步是**在一堆重复里数出到底有几个不同的东西**：
 * 同一篇文章挂在三个站点、同一个项目被三份资料各讲一遍、自己两年前的反思
 * 和上周的复盘说的是同一件事。学生看到 20 条，以为这个方向已经很拥挤，
 * 其实只有 6 件事。
 *
 * 为什么是 tool 不是 prompt（S9 那条判据）：
 * - **URL 规范化是确定性的**。`?utm_source=` 要不要算同一个链接不需要判断力，
 *   而模型在这件事上会凭感觉，同一批数据跑两次给出不同分组
 * - **两两比对是 O(n²)**。20 条就是 190 对，让模型在脑子里做完还保持一致，
 *   是在浪费它的注意力，也浪费 token
 *
 * 但**语义上是不是一回事**是判断题，不是计算题。所以这里只做两件确定的事：
 * URL 相同、字面高度重合。落在中间地带的成对报出来，让模型自己看——
 * 把判断题也做成阈值，就会把"同一场比赛的两个不同角度"合并成一条。
 *
 * S11 的 `web_search` 落地后，网页结果走的是同一个入口：这里不关心结果从哪来，
 * 只认 `{title, url, text}` 这个形状。
 */

/** 一次最多处理多少条。两两比对是 O(n²)，这个量级下仍然是毫秒级 */
const MAX_ITEMS = 100
/**
 * 字符 n-gram 的 n。用字符不用词：中文按词切分本身就不可靠，字符 gram 中英文通吃。
 *
 * 取 2 是实测定的。同一批样本上 n=3 与 n=2 的分离度：
 *
 * | 场景 | n=2 | n=3 |
 * |---|---|---|
 * | 几乎同一句（4 处小改） | 68% | 57% |
 * | 英文近重复（换了两个词） | 84% | 74% |
 * | 同一件事的不同角度（不该合） | 7% | 3% |
 * | 完全无关 | 0% | 0% |
 *
 * n=3 下"英文近重复"只有 74%——同一篇文章在几个站点间改两个词就漏判，
 * 而那正是最常见的一类重复。n=2 把两群拉开到 68–84% 对 0–7%，中间是大片空档。
 */
const SHINGLE = 2
/** 字面重合到这个程度，直接判为重复。落在上表的空档里，两边都留足余量 */
const DUPLICATE_AT = 0.65
/**
 * 落在这之上、DUPLICATE_AT 之下的报为"疑似"——只是**差一点就算重复**的字面接近，
 * 不代表语义相关。
 *
 * 这条线不能再往下探。实测过一批样本：
 *
 * | | 重合度区间 |
 * |---|---|
 * | 同一件事、措辞不同（该合） | 17% – 30% |
 * | 不同的事、同一主题（不该合） | 0% – 21% |
 *
 * **两群是重叠的**：「区域赛拿了第四」与「名次是第四名」只有 17%，
 * 而「本周复盘」与「上周复盘」有 21%——后者明明是两周不同的事。
 * 所以不存在一个能区分"语义是不是一回事"的阈值，往下调只会造出一片噪音，
 * 让模型去看一堆假线索。**语义归并是模型的活，这里不装作能做。**
 */
const SIMILAR_AT = 0.45
/** 疑似最多报几对。O(n²) 对数，全报出来会把工具结果撑爆，也没人看得完 */
const MAX_SIMILAR = 12

/** 追踪参数，去掉之后才谈得上"是不是同一个链接" */
const TRACKING = /^(utm_|fbclid$|gclid$|msclkid$|spm$|ref$|referrer$|source$|from$|share|_hs)/i

/**
 * URL 规范化。只做**无争议**的那几项：协议、大小写、www、追踪参数、
 * 锚点、末尾斜杠、index 页。不碰路径大小写（有些站点区分），不碰查询参数顺序之外的语义。
 */
export function canonicalUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const params = [...url.searchParams.entries()]
      .filter(([k]) => !TRACKING.test(k))
      .sort(([a], [b]) => a.localeCompare(b))
    const query = params.map(([k, v]) => `${k}=${v}`).join('&')
    const path = url.pathname.replace(/\/index\.(html?|php)$/i, '/').replace(/\/+$/, '')
    return `${host}${path}${query ? `?${query}` : ''}`
  } catch {
    // 不是合法 URL（本地资产没有 url，或者模型给了半截）：按原文小写比对
    return trimmed.toLowerCase()
  }
}

/** 标题/正文归一：去空白、标点、全角转半角，只留下比较用的骨架 */
export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]+/g, '')
    .replace(/[.,;:!?'"()[\]{}\-—–…、。，；：！？「」『』（）《》·/\\|@#*_~`+=<>$%^&]/g, '')
}

function shingles(text: string): Set<string> {
  const out = new Set<string>()
  if (text.length <= SHINGLE) {
    if (text) out.add(text)
    return out
  }
  for (let i = 0; i + SHINGLE <= text.length; i++) out.add(text.slice(i, i + SHINGLE))
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const gram of small) if (large.has(gram)) shared++
  return shared / (a.size + b.size - shared)
}

interface Finding {
  index: number
  id: string
  title: string
  url: string
  source: string
  text: string
  canonical: string
  normTitle: string
  grams: Set<string>
  /** 用来挑代表：信息最多的那条 */
  weight: number
}

function toFinding(raw: unknown, index: number): Finding | null {
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    return build({ index, id: String(index), title: '', url: '', source: '', text })
  }
  if (typeof raw !== 'object' || raw === null) return null
  const item = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const title = str(item.title)
  const text = str(item.text) || str(item.snippet) || str(item.content) || str(item.summary)
  if (!title && !text) return null
  return build({
    index,
    id: str(item.id) || String(index),
    title,
    url: str(item.url),
    source: str(item.source),
    text,
  })
}

function build(base: Omit<Finding, 'canonical' | 'normTitle' | 'grams' | 'weight'>): Finding {
  const normTitle = normalizeText(base.title)
  const body = normalizeText(`${base.title} ${base.text}`)
  return {
    ...base,
    canonical: base.url ? canonicalUrl(base.url) : '',
    normTitle,
    grams: shingles(body),
    weight: body.length,
  }
}

/** 判定两条是不是同一件事，以及依据 —— 依据要一并回给模型，别让它猜为什么被合了 */
function relate(a: Finding, b: Finding): { duplicate: boolean; score: number; reason: string } {
  if (a.canonical && b.canonical && a.canonical === b.canonical) {
    return { duplicate: true, score: 1, reason: `同一个链接（规范化后都是 ${a.canonical}）` }
  }
  if (a.normTitle && a.normTitle === b.normTitle) {
    return { duplicate: true, score: 1, reason: '标题完全相同' }
  }
  const score = jaccard(a.grams, b.grams)
  return { duplicate: score >= DUPLICATE_AT, score, reason: `字面重合 ${(score * 100).toFixed(0)}%` }
}

export interface DedupeOutcome {
  kept: Finding[]
  clusters: { keep: Finding; merged: Finding[]; reasons: string[] }[]
  similar: { a: Finding; b: Finding; score: number }[]
  skipped: number
}

export function dedupeFindings(rawList: unknown[]): DedupeOutcome {
  const findings: Finding[] = []
  let skipped = 0
  for (const [i, raw] of rawList.entries()) {
    if (findings.length >= MAX_ITEMS) {
      skipped++
      continue
    }
    const finding = toFinding(raw, i)
    if (finding) findings.push(finding)
    else skipped++
  }

  // 并查集：A≡B、B≡C 时 A 与 C 也该在一组，逐对贪心合并做不到这一点
  const parent = findings.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const reasons = new Map<number, string[]>()
  const similar: DedupeOutcome['similar'] = []

  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const { duplicate, score, reason } = relate(findings[i], findings[j])
      if (duplicate) {
        const [ri, rj] = [find(i), find(j)]
        if (ri !== rj) parent[rj] = ri
        const list = reasons.get(find(i)) ?? []
        list.push(`#${findings[j].id} ≡ #${findings[i].id}：${reason}`)
        reasons.set(find(i), list)
      } else if (score >= SIMILAR_AT) {
        similar.push({ a: findings[i], b: findings[j], score })
      }
    }
  }

  const groups = new Map<number, Finding[]>()
  for (let i = 0; i < findings.length; i++) {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), findings[i]])
  }

  const kept: Finding[] = []
  const clusters: DedupeOutcome['clusters'] = []
  for (const [root, group] of groups) {
    // 代表取信息最多的那条：合并之后学生只会看到这一条，留最短的等于丢信息
    const keep = group.reduce((best, f) => (f.weight > best.weight ? f : best), group[0])
    kept.push(keep)
    if (group.length > 1) {
      clusters.push({ keep, merged: group.filter((f) => f !== keep), reasons: reasons.get(root) ?? [] })
    }
  }
  kept.sort((a, b) => a.index - b.index)

  // 疑似里两端已经在同一组的就不必再报了；剩下的取重合度最高的几对，
  // 全报出来既撑爆工具结果也没人看得完
  const stillSimilar = similar
    .filter((p) => find(p.a.index) !== find(p.b.index))
    .sort((x, y) => y.score - x.score)
    .slice(0, MAX_SIMILAR)
  return { kept, clusters, similar: stillSimilar, skipped }
}

const brief = (f: Finding) => ({
  id: f.id,
  ...(f.title ? { title: f.title } : {}),
  ...(f.url ? { url: f.url } : {}),
  ...(f.source ? { source: f.source } : {}),
})

export const dedupeFindingsCapability: Capability = {
  name: 'dedupe_findings',
  kind: 'read',
  label: '检索结果去重',
  describeCall: (rawArgs) => {
    try {
      const { findings } = JSON.parse(rawArgs || '{}') as { findings?: unknown[] }
      const n = Array.isArray(findings) ? findings.length : 0
      return n > 0 ? `给 ${n} 条检索结果去重` : undefined
    } catch {
      return undefined
    }
  },
  summary: '把一批检索结果按链接与字面重合度合并，报出到底有几件不同的事',
  owner: 'core',
  schema: {
    name: 'dedupe_findings',
    description:
      '把一批检索结果（来自 search_artifacts、或你自己整理的资料清单）合并去重，返回"到底有几件不同的事"。' +
      '\n\n什么时候用：搜出来一堆条目、准备据此下判断之前。同一篇东西挂在几个地方、同一个项目被几份资料各讲一遍时，' +
      '不去重就会把"这个方向已经很拥挤"这种结论建在重复计数上。' +
      '\n\n**它只认字面，不认语义。** 能合的是：链接规范化后相同（忽略 utm 之类的追踪参数）、标题相同、文字高度重合。' +
      '「区域赛拿了第四」和「名次是第四名」讲的是同一件事，但字面几乎不重合，它合不了——' +
      '**这类归并是你的活**：拿到 kept 之后自己看一遍标题和片段，把说同一件事的再并一次，并到最后再报数字给用户。' +
      '返回里的 `similar` 只是「差一点就算重复」的字面接近，不是语义相关，也没有合并。' +
      `\n\n一次最多 ${MAX_ITEMS} 条。`,
    parameters: {
      type: 'object',
      properties: {
        findings: {
          type: 'array',
          description: '要去重的条目。也可以直接传字符串数组。',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '你自己的编号，缺省用下标。去重结果按它回指' },
              title: { type: 'string', description: '标题' },
              url: { type: 'string', description: '链接（有就给，链接相同是最硬的重复依据）' },
              source: { type: 'string', description: '来源，如「我的反思」「某网站」' },
              text: { type: 'string', description: '正文或摘要片段' },
            },
          },
        },
      },
      required: ['findings'],
    },
  },
  execute: async (rawArgs) => {
    let list: unknown[]
    try {
      const args = JSON.parse(rawArgs || '{}') as { findings?: unknown }
      list = Array.isArray(args.findings) ? args.findings : []
    } catch {
      return JSON.stringify({ error: '参数不是合法 JSON' })
    }
    if (list.length === 0) return JSON.stringify({ error: 'findings 不能为空' })

    const { kept, clusters, similar, skipped } = dedupeFindings(list)
    return JSON.stringify({
      received: list.length,
      distinct: kept.length,
      ...(skipped > 0 ? { skipped, skippedNote: `${skipped} 条没有 title 也没有 text，或超出 ${MAX_ITEMS} 条上限` } : {}),
      kept: kept.map(brief),
      mergedGroups: clusters.map((c) => ({
        keep: brief(c.keep),
        merged: c.merged.map(brief),
        reasons: c.reasons,
      })),
      similar: similar.map((p) => ({
        a: brief(p.a),
        b: brief(p.b),
        overlap: `${(p.score * 100).toFixed(0)}%`,
      })),
      note:
        'kept 是**字面**去重后的清单，按原顺序。similar 只是"差一点就算重复"，没有合并。' +
        '措辞不同但说的是同一件事的，字面查不出来——请自己再过一遍 kept 里的标题与片段，' +
        '合并之后再把数字报给用户。',
    })
  },
}
