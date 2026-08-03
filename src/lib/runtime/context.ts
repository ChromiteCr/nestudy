import type { ChatTurn } from '@/lib/ai/provider'
import type { Message } from '@/types'

/**
 * 上下文装配。
 *
 * 分工照搬成熟 agent 框架的那条硬线：**历史是持久的，上下文是每轮现装的**。
 * 消息（含工具调用与工具结果）全部落库，模型每轮看到的则是从这堆历史里
 * 按预算装配出来的一份——超预算就压缩，而不是无限往上堆。
 *
 * S8 以前这里是反的：只回放 user/assistant 文本，工具轮次是回合内的临时变量。
 * 结果是模型每个回合都从零开始摸索，同一份数据要反复读，刷新之后连读过什么都不知道。
 */

/**
 * 回放旧轮次时单条工具结果的字符上限。
 *
 * 只作用于**过去的**轮次：当前回合内模型看到的是完整结果，否则它刚读到的数据
 * 会在下一次工具调用后凭空变短。旧轮次留一个摘要长度就够，细节要用再读一次。
 */
export const TOOL_RESULT_REPLAY_LIMIT = 4000

/** 给模型回复留的余量：上下文涨到 window - reserve 就该压缩了 */
export const COMPACTION_RESERVE_TOKENS = 8000

/** 自动压缩时至少保留这么多 token 的近期历史 */
export const KEEP_RECENT_TOKENS = 16000

/**
 * 手动压缩（/compact）保留的近期历史。
 * 比自动压缩留得少：用户主动敲这条命令就是嫌上下文重了，
 * 这时候还按自动的阈值判「不够长，不用压」等于没执行命令。
 */
export const MANUAL_KEEP_RECENT_TOKENS = 4000

/**
 * token 估算。浏览器里塞一个真 tokenizer 不值当（体积远大于收益），
 * 用字符数近似：CJK 基本 1 字 1 token，拉丁文 ~4 字符 1 token。
 * 这是个**估算**，用于决定何时压缩，不用于计费，宁可偏保守。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let cjk = 0
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (code >= 0x2e80 && code <= 0x9fff) cjk++
    else if (code >= 0xf900 && code <= 0xfaff) cjk++
    else if (code >= 0xff00 && code <= 0xffef) cjk++
  }
  const rest = [...text].length - cjk
  return cjk + Math.ceil(rest / 3.5)
}

function truncateForReplay(content: string): { content: string; truncated: boolean } {
  if (content.length <= TOOL_RESULT_REPLAY_LIMIT) return { content, truncated: false }
  return {
    content: `${content.slice(0, TOOL_RESULT_REPLAY_LIMIT)}\n…（结果过长，已截断 ${content.length - TOOL_RESULT_REPLAY_LIMIT} 字符；需要完整内容请再调用一次并收窄参数）`,
    truncated: true,
  }
}

export interface SelectedContext {
  /** 最近一次压缩产生的摘要；null 表示还没压缩过 */
  summary: string | null
  /** 摘要之后原样保留的消息 */
  kept: Message[]
}

/** 按最近一次压缩记录切出要回放的消息 */
export function selectContextMessages(messages: Message[]): SelectedContext {
  let last: Message | undefined
  for (const m of messages) if (m.compaction) last = m
  if (!last?.compaction) return { summary: null, kept: messages.filter((m) => !m.compaction) }

  const from = messages.findIndex((m) => m.id === last!.compaction!.firstKeptMessageId)
  const kept = (from === -1 ? messages : messages.slice(from)).filter((m) => !m.compaction)
  return { summary: last.content, kept }
}

/**
 * 消息 → 模型轮次。
 *
 * 两处防御，都为了不给服务端送出非法序列（送出去是 400，整个会话卡死）：
 * - assistant 带了 toolCalls 但对应的 tool 结果不在（上一轮被中断/被压掉）→ 摘掉 toolCalls
 * - 孤儿 tool 结果（前面没有发起它的 assistant）→ 丢弃
 */
export function buildTurns(messages: Message[]): ChatTurn[] {
  const { summary, kept } = selectContextMessages(messages)
  const turns: ChatTurn[] = []

  if (summary) {
    turns.push({
      role: 'user',
      content: `【此前对话的压缩摘要，供你延续上下文，不要向用户复述】\n${summary}`,
    })
  }

  const resultsByCallId = new Map<string, Message>()
  for (const m of kept) {
    if (m.role === 'tool' && m.toolCallId) resultsByCallId.set(m.toolCallId, m)
  }
  const consumed = new Set<string>()

  for (const m of kept) {
    if (m.role === 'user') {
      if (m.content) turns.push({ role: 'user', content: m.content })
      continue
    }

    if (m.role === 'assistant') {
      // 提案卡本身不进上下文：模型在发起提案那一轮已经收到过回执，
      // 用户确认与否是应用层的事，重放一遍只会诱导它重复提案
      if (m.proposal) continue
      const calls = (m.toolCalls ?? []).filter((c) => resultsByCallId.has(c.id))
      if (calls.length === 0) {
        if (m.content) turns.push({ role: 'assistant', content: m.content })
        continue
      }
      turns.push({ role: 'assistant', content: m.content, toolCalls: calls })
      for (const call of calls) {
        const result = resultsByCallId.get(call.id)!
        consumed.add(call.id)
        turns.push({
          role: 'tool',
          toolCallId: call.id,
          content: truncateForReplay(result.content).content,
        })
      }
      continue
    }

    // tool 结果已在上面跟着它的 assistant 一起发出；剩下的是孤儿，丢弃
    if (m.role === 'tool' && m.toolCallId && !consumed.has(m.toolCallId)) continue
  }

  return turns
}

export function estimateTurnsTokens(turns: ChatTurn[]): number {
  let total = 0
  for (const turn of turns) {
    total += estimateTokens(turn.content) + 4
    if (turn.role === 'assistant' && turn.toolCalls) {
      for (const c of turn.toolCalls) total += estimateTokens(c.name) + estimateTokens(c.arguments) + 8
    }
  }
  return total
}

export interface ContextUsage {
  tokens: number
  limit: number
  /** 0–1，超过 1 说明已经该压缩了 */
  ratio: number
  needsCompaction: boolean
}

export function measureContext(systemPrompt: string, messages: Message[], contextWindow: number): ContextUsage {
  const tokens = estimateTokens(systemPrompt) + estimateTurnsTokens(buildTurns(messages))
  const limit = Math.max(1, contextWindow - COMPACTION_RESERVE_TOKENS)
  return { tokens, limit, ratio: tokens / limit, needsCompaction: tokens > limit }
}

export interface CompactionPlan {
  /** 这条及其之后的消息原样保留 */
  firstKeptMessageId: string
  /** 要被摘要顶替的消息 */
  dropped: Message[]
}

/**
 * 规划一次压缩：从最新往回累计到 KEEP_RECENT_TOKENS，然后**切在用户消息边界上**。
 *
 * 必须切在用户消息处，否则可能把 assistant 的 toolCalls 和它的 tool 结果劈开——
 * 那是个非法序列。切不出来（整段就是一个超长回合）就不压，让 buildTurns 的
 * 截断兜着，也不要送出坏数据。
 */
export function planCompaction(
  messages: Message[],
  keepRecentTokens = KEEP_RECENT_TOKENS,
): CompactionPlan | null {
  const { kept } = selectContextMessages(messages)
  if (kept.length === 0) return null

  let budget = keepRecentTokens
  let boundary = kept.length
  for (let i = kept.length - 1; i >= 0; i--) {
    budget -= estimateTokens(kept[i].content)
    if (budget <= 0) break
    if (kept[i].role === 'user') boundary = i
  }
  // 没有可切的边界，或者切了等于什么都没压掉
  if (boundary <= 0 || boundary >= kept.length) return null

  const dropped = kept.slice(0, boundary)
  if (dropped.length === 0) return null
  return { firstKeptMessageId: kept[boundary].id, dropped }
}

/** 把要压缩的消息渲染成给摘要模型看的文本 */
export function renderForSummary(messages: Message[]): string {
  return messages
    .map((m) => {
      if (m.role === 'user') return `用户：${m.content}`
      if (m.role === 'tool') return `工具结果（${m.toolName ?? '未知'}）：${truncateForReplay(m.content).content}`
      if (m.proposal) return `助手：提出了一张 ${m.proposal.kind} 提案卡（状态：${m.proposal.status}）`
      const calls = m.toolCalls?.map((c) => c.name).join('、')
      return `助手：${m.content}${calls ? `（调用了 ${calls}）` : ''}`
    })
    .join('\n')
}
