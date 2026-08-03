import type { ChatProvider } from '@/lib/ai/provider'
import { estimateTokens, planCompaction, renderForSummary, type CompactionPlan } from './context'
import type { Message } from '@/types'

/**
 * 上下文压缩。
 *
 * 会话长到快撑满窗口时，把靠前那一段换成一段摘要，近期原样保留。
 * **历史本身不动**——被压掉的消息还在库里、还在界面上，压缩只改变"每轮送给模型的那份"。
 * 这条边界很重要：压缩是上下文策略，不是删数据。
 */

const SUMMARY_PROMPT = `你在压缩一段学习助手与学生的对话历史，供后续轮次继续使用。写一段结构化摘要，尽量短，但下面这些**不能丢**：

1. 学生说过的事实：档案信息、经历、时间点、明确的偏好与约束
2. 已经读取过的数据要点（读到了什么，不是读了哪个工具）
3. 已经产生的提案卡及其结果（确认了什么、忽略了什么）
4. 尚未完成的事：答应过要做但还没做的、悬而未决的问题
5. 当前正在遵循的 skill 及其关键约束（如果有）

不要复述寒暄，不要加评价，不要编造原文里没有的内容。直接输出摘要正文，不要写"以下是摘要"之类的开场白。`

export interface CompactionOutcome {
  summary: string
  plan: CompactionPlan
  beforeTokens: number
}

/**
 * 生成摘要。**不写库**——落库由调用方做，这样压缩逻辑本身不依赖 store。
 * 返回 null 表示这次没什么可压的（历史太短，或切不出安全边界）。
 */
export async function summarizeForCompaction(
  provider: ChatProvider,
  messages: Message[],
  options: { keepRecentTokens?: number; signal?: AbortSignal } = {},
): Promise<CompactionOutcome | null> {
  const { keepRecentTokens, signal } = options
  const plan = planCompaction(messages, keepRecentTokens)
  if (!plan) return null

  const transcript = renderForSummary(plan.dropped)
  const beforeTokens = estimateTokens(transcript)

  let summary = ''
  for await (const event of provider.streamChat(
    [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: transcript },
    ],
    { signal },
  )) {
    if (event.type === 'text') summary += event.text
  }

  summary = summary.trim()
  if (!summary) return null
  return { summary, plan, beforeTokens }
}
