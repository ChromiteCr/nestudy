import OpenAI from 'openai'
import type { ModelConfig } from '@/types'
import type { ChatProvider, ChatTurn, StreamOptions } from './provider'

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

  async *streamChat(messages: ChatTurn[], opts?: StreamOptions): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })) as never,
        stream: true,
      },
      { signal: opts?.signal },
    )
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  }
}
