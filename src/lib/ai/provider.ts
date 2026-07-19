import type { MessageRole } from '@/types'

export interface ChatTurn {
  role: MessageRole
  content: string
}

export interface StreamOptions {
  signal?: AbortSignal
}

/**
 * 统一的模型调用接口。所有 LLM 请求经此抽象：
 * - S1: OpenAICompatibleProvider（自带 Key 浏览器直连 DeepSeek）
 * - S2: ProxyProvider（北京服务器无状态代理，免费层）
 * 切换通道只改 resolveProvider，不动 UI/业务层。
 */
export interface ChatProvider {
  streamChat(messages: ChatTurn[], opts?: StreamOptions): AsyncIterable<string>
}
