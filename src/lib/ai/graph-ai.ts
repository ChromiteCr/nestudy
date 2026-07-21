import OpenAI from 'openai'
import { useSettingsStore } from '@/stores/settingsStore'

export function getOpenAIClient(): { openai: OpenAI; model: string } {
  const { modelConfig } = useSettingsStore.getState()
  if (!modelConfig.apiKey) throw new Error('请先在设置中填写 API Key')
  return {
    openai: new OpenAI({ baseURL: modelConfig.baseURL, apiKey: modelConfig.apiKey, dangerouslyAllowBrowser: true }),
    model: modelConfig.model,
  }
}

async function oneLine(system: string, user: string): Promise<string> {
  const { openai, model } = getOpenAIClient()
  const res = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return (res.choices[0]?.message?.content ?? '').trim().replace(/^["“]|["”]$/g, '')
}

/** 为星图节点重新生成一句话注解（对成长/申请方向的意义） */
export function regenerateNodeBlurb(label: string, kind: string, majors: string[]): Promise<string> {
  const dir = majors.length ? `目标方向是「${majors.join('、')}」` : '（暂无明确专业方向）'
  return oneLine(
    `你在帮国际部学生做成长星图。为一个${kind === 'course' ? '课程/学科' : kind === 'major' ? '专业方向' : '活动'}节点写一句话注解，说明它对学生成长与申请的意义或亮点。20-45 字，中文，只输出一句话，不要引号、不要前缀。`,
    `节点：${label}。${dir}。`,
  )
}

/** 为两个节点之间的叙事线重新生成连接说明 */
export function regenerateEdgeReason(sourceLabel: string, targetLabel: string, majors: string[]): Promise<string> {
  const dir = majors.length ? `，共同指向「${majors.join('、')}」方向` : ''
  return oneLine(
    `你在帮国际部学生梳理成长叙事。用一句话说明两个经历/学科如何相互支撑、共同体现学生的成长${dir}。20-45 字，中文，只输出一句话，不要引号。`,
    `连接：${sourceLabel} ↔ ${targetLabel}。`,
  )
}

/** AI 综合级别、专业相关性、完成度、可扩展性给节点分层：返回 label→shell(1核心/2次要/3外围) */
export async function suggestShells(
  items: { label: string; kind: string }[],
  majors: string[],
): Promise<Record<string, number>> {
  const { openai, model } = getOpenAIClient()
  const list = items.map((it, i) => `${i + 1}. ${it.label}（${it.kind}）`).join('\n')
  const dir = majors.length ? `专业方向：${majors.join('、')}。` : ''
  const res = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: `你在为学生的成长星图分层。${dir}综合考虑活动级别、与专业方向的相关性、完成度、可扩展性，把每个节点分到：1=核心（最能支撑方向）、2=次要、3=外围。只输出 JSON 数组，形如 [{"label":"...","shell":1}]，label 与输入完全一致，不要多余文字。`,
      },
      { role: 'user', content: list },
    ],
  })
  const text = res.choices[0]?.message?.content ?? '[]'
  const jsonStr = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  const parsed = JSON.parse(jsonStr) as { label?: string; shell?: number }[]
  const out: Record<string, number> = {}
  for (const p of parsed) {
    if (p.label && (p.shell === 1 || p.shell === 2 || p.shell === 3)) out[p.label] = p.shell
  }
  return out
}
