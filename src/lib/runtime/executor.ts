import type { ChatProvider, ChatTurn, StreamEvent, ToolCallRequest } from '@/lib/ai/provider'
import type { Capability } from '@/lib/capabilities'
import type { Proposal } from '@/types'

/**
 * 多轮 session 引擎。
 *
 * 从 chatStore 里抽出来的原因不只是文件太长：skill 要能配自己的轮数上限，
 * S12 的商店要能在不启动一次真实对话的前提下描述"这个 skill 会跑几轮、能碰什么"，
 * 而这些都不该由一个 zustand store 说了算。
 *
 * 这里不碰 IndexedDB、不碰 React——落库与渲染由调用方的回调完成。
 */

/** 一轮工具产出的字符预算。超了就停止再喂读工具，把结论逼出来。 */
const TOOL_OUTPUT_BUDGET = 24_000

export interface RunHandlers {
  /** 本轮文本流式增量（传的是累计全文，UI 直接渲染即可） */
  onTextDelta: (full: string) => void
  /** 本轮文本定稿，可以落库了 */
  onTextEnd: (full: string) => Promise<void>
  /** 产出一张提案确认卡 */
  onProposal: (proposal: Proposal) => Promise<void>
}

export interface RunRequest {
  provider: ChatProvider
  systemPrompt: string
  /** 不含 system 的历史（user / assistant 文本） */
  history: ChatTurn[]
  /** 本次运行下发的能力面；不在这里的工具连 schema 都不下发 */
  capabilities: Capability[]
  maxRounds: number
  signal: AbortSignal
  handlers: RunHandlers
}

export type RunStop = 'text' | 'rounds' | 'budget'

export interface RunResult {
  rounds: number
  proposals: number
  stop: RunStop
}

export async function runAgentLoop({
  provider,
  systemPrompt,
  history,
  capabilities,
  maxRounds,
  signal,
  handlers,
}: RunRequest): Promise<RunResult> {
  const tools = capabilities.map((c) => c.schema)
  // 双层守卫的第二层：即便模型凭幻觉喊出一个没下发的工具名，这里也拦得住。
  // 第一层是上面那行——不允许的能力连 schema 都不下发。
  const allowed = new Map(capabilities.map((c) => [c.name, c]))

  const convo: ChatTurn[] = [{ role: 'system', content: systemPrompt }, ...history]
  let proposals = 0
  let toolChars = 0

  for (let round = 0; round < maxRounds; round++) {
    let text = ''
    const { toolCalls } = await collectRound(provider.streamChat(convo, { signal, tools }), (delta) => {
      text += delta
      handlers.onTextDelta(text)
    })

    if (text) await handlers.onTextEnd(text)
    if (toolCalls.length === 0) return { rounds: round + 1, proposals, stop: 'text' }

    convo.push({ role: 'assistant', content: text, toolCalls })

    for (const call of toolCalls) {
      const capability = allowed.get(call.name)
      if (!capability) {
        convo.push({ role: 'tool', toolCallId: call.id, content: '该能力在当前 skill 下不可用' })
        continue
      }

      if (capability.kind === 'read') {
        if (toolChars >= TOOL_OUTPUT_BUDGET) {
          convo.push({
            role: 'tool',
            toolCallId: call.id,
            content: '本轮读取的数据已达上限，请用已有信息作答，不要再调用读取工具。',
          })
          continue
        }
        const result = (await capability.execute?.(call.arguments)) ?? '{}'
        toolChars += result.length
        convo.push({ role: 'tool', toolCallId: call.id, content: result })
        continue
      }

      let proposal: Proposal | null
      try {
        proposal = capability.parse?.(call.arguments) ?? null
      } catch {
        convo.push({ role: 'tool', toolCallId: call.id, content: '参数 JSON 解析失败，请修正后重试' })
        continue
      }
      if (!proposal) {
        convo.push({
          role: 'tool',
          toolCallId: call.id,
          content: '提案为空，未展示。请确认内容后重试或直接告知用户。',
        })
        continue
      }
      await handlers.onProposal(proposal)
      proposals++
      convo.push({
        role: 'tool',
        toolCallId: call.id,
        content: '提案卡已展示给用户，等待用户在卡片上确认或编辑。不要重复调用，也不要声称已保存。',
      })
    }

    if (toolChars >= TOOL_OUTPUT_BUDGET && round === maxRounds - 1) {
      return { rounds: round + 1, proposals, stop: 'budget' }
    }
  }

  return { rounds: maxRounds, proposals, stop: 'rounds' }
}

async function collectRound(stream: AsyncIterable<StreamEvent>, onText: (delta: string) => void) {
  const toolCalls: ToolCallRequest[] = []
  for await (const event of stream) {
    if (event.type === 'text') onText(event.text)
    else toolCalls.push(...event.calls)
  }
  return { toolCalls }
}
