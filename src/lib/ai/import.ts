import OpenAI from 'openai'
import { isoToday } from '@/lib/db/planning'
import { useSettingsStore } from '@/stores/settingsStore'
import { AGENT_TOOLS } from './tools'
import { parseImportArgs } from './proposals'
import type { ProposedEvent, ProposedTask } from '@/types'

/**
 * 独立的一次性解析（导入弹窗用）：强制模型调用 propose_import，
 * 不走聊天历史，非流式。
 */
export async function parseImportText(text: string): Promise<{ events: ProposedEvent[]; tasks: ProposedTask[] }> {
  const { modelConfig } = useSettingsStore.getState()
  if (!modelConfig.apiKey) throw new Error('请先在设置中填写 API Key')

  const client = new OpenAI({
    baseURL: modelConfig.baseURL,
    apiKey: modelConfig.apiKey,
    dangerouslyAllowBrowser: true,
  })
  const importTool = AGENT_TOOLS.find((t) => t.name === 'propose_import')!

  // 注：思考模式模型（如 deepseek 推理系列）不支持强制 tool_choice，用 auto + 强指令
  const completion = await client.chat.completions.create({
    model: modelConfig.model,
    messages: [
      {
        role: 'system',
        content: `你是日程解析器。今天是 ${isoToday()}。从用户粘贴的通知/邮件/安排文字中提取考试、截止日期、活动（events）和需要做的行动项（tasks），必须调用 propose_import 工具返回结果，不要用文字回答。相对日期（如"下周五"）按今天推算为 YYYY-MM-DD。没有明确日期的条目不要编造日期，直接省略。`,
      },
      { role: 'user', content: text },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: importTool.name,
          description: importTool.description,
          parameters: importTool.parameters,
        },
      },
    ],
    tool_choice: 'auto',
  })

  const call = completion.choices[0]?.message?.tool_calls?.find(
    (c) => c.type === 'function' && c.function.name === 'propose_import',
  )
  if (!call || call.type !== 'function') throw new Error('解析失败：模型未返回结构化结果，请重试')
  return parseImportArgs(call.function.arguments)
}
