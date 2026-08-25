import type { ModelConfig } from '@/types'
import { getToken, relayOrigin, RELAY_MODEL } from '@/lib/api'
import type { ChatProvider } from './provider'
import { OpenAICompatibleProvider } from './openai-compatible'

export type { ChatProvider, ChatTurn, StreamEvent, StreamOptions, ToolCallRequest, ToolDef } from './provider'

/**
 * 免费通道的上下文窗口。
 *
 * **前端不知道上游是谁**——那是 relay 的设计（换供应商不该变成一次前端发版）。
 * 不知道就取一个保守的值：小了只是压缩得勤一点，大了会在某一轮直接撞上 400，
 * 而那一轮学生已经打完字了。
 */
const FREE_CONTEXT_WINDOW = 64_000

/**
 * 这个 provider 是拿来干什么的。
 *
 * `aux` 是压缩历史、起标题这类**给自己看的活**：把二十条消息缩成一段话不需要
 * 最好的模型，而它在一次长对话里会跑好几遍。免费通道据此走 quick 档；
 * 自带 Key 的人只配了一个模型，两种用途都是它。
 */
export type ProviderPurpose = 'chat' | 'aux'

export function resolveProvider(config: ModelConfig, purpose: ProviderPurpose = 'chat'): ChatProvider {
  switch (config.tier) {
    case 'custom':
      return new OpenAICompatibleProvider(config)
    case 'free': {
      const token = getToken()
      if (!token) {
        throw new Error('免费通道要先登录：设置 → 账号，用邮箱收一个验证码。')
      }
      return new OpenAICompatibleProvider({
        tier: 'free',
        // relay 认的是会话令牌，不是模型服务商的 key。上游那把 key 在服务器上，
        // 一个字节都不会到浏览器里
        baseURL: `${relayOrigin()}/v1`,
        apiKey: token,
        model: purpose === 'aux' ? RELAY_MODEL.quick : RELAY_MODEL.tutor,
        contextWindow: FREE_CONTEXT_WINDOW,
      })
    }
    default:
      throw new Error(`未知的模型通道：${config.tier satisfies never}`)
  }
}
