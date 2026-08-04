import type { ChatProvider } from '@/lib/ai/provider'
import type { Message } from '@/types'

/**
 * 会话标题。
 *
 * 首条消息截前 24 字当标题，遇到「帮我看看 /admissions-reader 我的档案」这种
 * 就只剩一串命令名，抽屉里一排会话长得一模一样。改成首轮结束后让模型起一个。
 *
 * 起标题**不进对话历史**：它是一次一次性调用，不带工具、不落库，
 * 免得给下一轮凭空塞进一段与用户无关的指令。
 */

const MAX_TITLE_CHARS = 18
/** 喂给起标题模型的素材长度上限，长文没必要整段送 */
const SOURCE_CHARS = 600

const PROMPT = `给下面这段对话起一个标题，概括它在谈什么。

要求：
- 不超过 ${MAX_TITLE_CHARS} 个字，越短越好
- 用对话本身的语言
- 只写标题，不要引号、书名号、句号，不要"关于""标题："之类的前缀
- 写具体：「IB 物理 IA 选题」好过「学习问题」`

const LEADING_LABEL = /^(标题|title)\s*[:：]\s*/i
const LEADING_MARK = /^[“"'「『《【[（(\s]+/
const TRAILING_MARK = /[”"'」』》】\]）)。.！!？?，,、；;：:\s]+$/

/**
 * 收拾模型的输出：它常会带前缀、引号、句号，还爱多写一行说明。
 *
 * 剥的时候要**循环到不再变化**——「…」。这种引号套句号是最常见的形式，
 * 只剥一遍的话，先剥掉句号才轮得到引号，顺序反了就会剩一个右引号。
 */
function cleanTitle(raw: string): string {
  const line = raw.trim().split('\n').find((l) => l.trim()) ?? ''
  let text = line.replace(LEADING_LABEL, '').trim()
  let prev = ''
  while (text !== prev) {
    prev = text
    text = text.replace(LEADING_MARK, '').replace(TRAILING_MARK, '')
  }
  return [...text].slice(0, MAX_TITLE_CHARS).join('')
}

/**
 * 依据首轮对话生成标题。失败返回 null——**调用方保留原来的兜底标题**，
 * 起标题失败不该影响对话本身。
 */
export async function generateConversationTitle(
  provider: ChatProvider,
  messages: Message[],
  signal?: AbortSignal,
): Promise<string | null> {
  const firstUser = messages.find((m) => m.role === 'user' && m.content)
  if (!firstUser) return null
  const firstReply = messages.find((m) => m.role === 'assistant' && m.content && !m.proposal)

  const source = [
    `用户：${firstUser.content.slice(0, SOURCE_CHARS)}`,
    firstReply ? `助手：${firstReply.content.slice(0, SOURCE_CHARS)}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  let text = ''
  try {
    for await (const event of provider.streamChat(
      [
        { role: 'system', content: PROMPT },
        { role: 'user', content: source },
      ],
      { signal },
    )) {
      if (event.type === 'text') text += event.text
    }
  } catch {
    return null
  }

  const title = cleanTitle(text)
  return title || null
}
