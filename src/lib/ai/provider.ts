// ---- 统一的模型调用抽象 ----
// S1: OpenAICompatibleProvider（自带 Key 浏览器直连 DeepSeek）
// S2: 增加 function-calling 支持（agent loop 的地基）
// 未来: ProxyProvider（北京服务器无状态代理，免费层）
// 切换通道只改 resolveProvider，不动 UI/业务层。

export interface ToolDef {
  name: string
  description: string
  /** JSON Schema */
  parameters: Record<string, unknown>
}

export interface ToolCallRequest {
  id: string
  name: string
  /** 原始 JSON 字符串参数 */
  arguments: string
}

export type ChatTurn =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCallRequest[] }
  | { role: 'tool'; content: string; toolCallId: string }

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_calls'; calls: ToolCallRequest[] }

export interface StreamOptions {
  signal?: AbortSignal
  tools?: ToolDef[]
}

export interface ChatProvider {
  streamChat(messages: ChatTurn[], opts?: StreamOptions): AsyncIterable<StreamEvent>
}
