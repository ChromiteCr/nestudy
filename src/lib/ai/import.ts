import OpenAI from 'openai'
import { isoToday } from '@/lib/db/dates'
import { parseEventsArgs, proposeEventsCapability } from '@/lib/capabilities/core/proposals'
import { useSettingsStore } from '@/stores/settingsStore'
import type { ProposedGrowthEvent } from '@/types'

/**
 * 独立的一次性解析（导入弹窗用）：只让模型调 propose_events，
 * 不走聊天历史，非流式。
 */
export async function parseImportText(text: string): Promise<ProposedGrowthEvent[]> {
  const { modelConfig } = useSettingsStore.getState()
  if (!modelConfig.apiKey) throw new Error('请先在设置中填写 API Key')

  const client = new OpenAI({
    baseURL: modelConfig.baseURL,
    apiKey: modelConfig.apiKey,
    dangerouslyAllowBrowser: true,
  })
  const tool = proposeEventsCapability.schema

  // 注：思考模式模型（如 deepseek 推理系列）不支持强制 tool_choice，用 auto + 强指令
  const completion = await client.chat.completions.create({
    model: modelConfig.model,
    messages: [
      {
        role: 'system',
        content: `你是日程解析器。今天是 ${isoToday()}。从用户粘贴的通知/邮件/安排文字中提取事项：考试、截止日期、需要做的行动项都是短期事项（kind="short"），会持续一段时间的活动/项目是长期事项（kind="long"）。必须调用 propose_events 工具返回结果，不要用文字回答。相对日期（如"下周五"）按今天推算为 YYYY-MM-DD。没有明确日期的条目不要编造日期，直接省略。`,
      },
      { role: 'user', content: text },
    ],
    tools: [
      {
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      },
    ],
    tool_choice: 'auto',
  })

  const call = completion.choices[0]?.message?.tool_calls?.find(
    (c) => c.type === 'function' && c.function.name === tool.name,
  )
  if (!call || call.type !== 'function') throw new Error('解析失败：模型未返回结构化结果，请重试')
  return parseEventsArgs(call.function.arguments)
}
