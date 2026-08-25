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

/**
 * 没登录时两条通道都走不了。
 *
 * 说「档案」不是「账号」：S11e2 之后账号并进了档案那一页，这里的指路要跟着改，
 * 否则学生按这句话去找会找不到。
 */
const SIGN_IN_FIRST = '要先登录才能用：设置 → 档案，用邮箱收一个验证码。'

export function resolveProvider(config: ModelConfig, purpose: ProviderPurpose = 'chat'): ChatProvider {
  /**
   * **两条通道都要登录，自带 Key 也不例外。**
   *
   * 自带 Key 那条本来不需要服务器——浏览器直连服务商，Key 和对话一个字节都不经过
   * 我们。所以这道门不是技术上的必需，是产品上的决定：用这个应用的人得有一个账号。
   *
   * 也因此**它不是一道安全边界**，得说清楚：这条路上没有服务器参与，
   * 手动往 localStorage 里塞一个假令牌就能绕过去。真正兜住的是开屏那次
   * `accountStore.load()`——它拿令牌去问服务器，假的和过期的都会在那时候被清掉。
   * 也就是说，绕过去的人在下一次联网开屏时就被请回登录页。
   *
   * 判据用「本机有没有会话令牌」而不是「me 已经加载出来」：断网时问不到服务器，
   * `me` 是 null，但人确实登录过——而自带 Key 那条路**本来就该能离线用**
   * （自建的 vLLM 或 Ollama 就在同一个局域网里）。按 `me` 判会把这些人整个挡在外面。
   */
  const token = getToken()
  if (!token) throw new Error(SIGN_IN_FIRST)

  switch (config.tier) {
    case 'custom':
      return new OpenAICompatibleProvider(config)
    case 'free': {
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
