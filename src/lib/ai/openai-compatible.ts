import OpenAI from 'openai'
import type { ModelConfig } from '@/types'
import type { ChatProvider, ChatTurn, StreamEvent, StreamOptions, ToolCallRequest } from './provider'

/**
 * OpenAI 兼容通道（DeepSeek / 其他兼容 API）。
 * dangerouslyAllowBrowser 仅用于"自带 Key"模式：key 由用户提供、存在本机，
 * 请求从浏览器直连模型 API，不经任何中间服务器。
 */
export class OpenAICompatibleProvider implements ChatProvider {
  private client: OpenAI
  private model: string

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    })
    this.model = config.model
  }

  async *streamChat(messages: ChatTurn[], opts?: StreamOptions): AsyncIterable<StreamEvent> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: messages.map(toOpenAIMessage) as never,
        tools: opts?.tools?.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        stream: true,
      },
      { signal: opts?.signal },
    )

    // tool_call 参数以增量片段到达，按 index 聚合
    const pending = new Map<number, { id: string; name: string; arguments: string }>()

    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      if (!choice) continue

      const textDelta = choice.delta?.content
      if (textDelta) yield { type: 'text', text: textDelta }

      for (const tc of choice.delta?.tool_calls ?? []) {
        const acc = pending.get(tc.index) ?? { id: '', name: '', arguments: '' }
        if (tc.id) acc.id = tc.id
        if (tc.function?.name) acc.name += tc.function.name
        if (tc.function?.arguments) acc.arguments += tc.function.arguments
        pending.set(tc.index, acc)
      }
    }

    if (pending.size > 0) {
      const calls: ToolCallRequest[] = [...pending.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, c]) => c)
      yield { type: 'tool_calls', calls }
    }
  }
}

function toOpenAIMessage(turn: ChatTurn) {
  if (turn.role === 'tool') {
    return { role: 'tool', content: turn.content, tool_call_id: turn.toolCallId }
  }
  if (turn.role === 'assistant' && turn.toolCalls?.length) {
    return {
      role: 'assistant',
      content: turn.content || null,
      tool_calls: turn.toolCalls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: c.arguments },
      })),
    }
  }
  return { role: turn.role, content: turn.content }
}
