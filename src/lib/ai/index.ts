import type { ModelConfig } from '@/types'
import type { ChatProvider } from './provider'
import { OpenAICompatibleProvider } from './openai-compatible'

export type { ChatProvider, ChatTurn, StreamEvent, StreamOptions, ToolCallRequest, ToolDef } from './provider'

/** 依据模型配置选择通道。S2 在此接入 ProxyProvider（免费层，北京服务器代理）。 */
export function resolveProvider(config: ModelConfig): ChatProvider {
  switch (config.tier) {
    case 'custom':
      return new OpenAICompatibleProvider(config)
    case 'free':
      throw new Error('免费通道将在 S2 上线，请先在设置中填写自己的 API Key')
    default:
      throw new Error(`未知的模型通道：${config.tier satisfies never}`)
  }
}
