import type { ChatProvider, ChatTurn, StreamEvent, ToolCallRequest } from '@/lib/ai/provider'
import { narrowForSkill, type Capability } from '@/lib/capabilities'
import { SKILL_LOADED_MARKER } from '@/lib/capabilities/core/skills'
import { getSkill, type LoadedSkill } from '@/lib/skills'
import type { AskRequest, MessageToolCall, Proposal } from '@/types'

/**
 * 多轮 session 引擎。
 *
 * 一轮 = 一次模型调用 + 它要求的全部工具执行。循环直到模型只说话不调工具，
 * 或撞上轮数/预算上限。工具调用与结果通过回调**逐条落库**，所以：
 * - 下一个用户回合能看到上一回合读到过什么（跨回合的上下文）
 * - 刷新页面不丢
 * - 界面上能看见 agent 到底做了什么，而不是一个转圈的黑箱
 *
 * skill 的正文不预先塞进 system prompt，而是模型自己调 read_skill 读进来
 * （渐进式披露）。读进来的那一刻，后续轮次的能力面按该 skill 的声明收窄。
 */

/**
 * 一次运行里工具产出的字符预算。超了就停止再喂读工具，把结论逼出来。
 * 轮数放宽之后这条才是真正的兜底：轮数管的是"别死循环"，
 * 这条管的是"别把上下文读爆"。
 */
const TOOL_OUTPUT_BUDGET = 80_000

export interface RunHandlers {
  /** 本轮文本流式增量（传累计全文，UI 直接渲染） */
  onTextDelta: (full: string) => void
  /** 本轮 assistant 消息定稿（可能只有 toolCalls 没有文本） */
  onAssistantTurn: (content: string, toolCalls: MessageToolCall[]) => Promise<void>
  /** 一条工具结果 */
  onToolResult: (toolCallId: string, toolName: string, content: string) => Promise<void>
  /** 产出一张提案确认卡 */
  onProposal: (proposal: Proposal) => Promise<void>
  /** 产出一张提问卡；出了它这次运行就停机等人 */
  onAsk: (request: AskRequest) => Promise<void>
  /** 能力面因为读入 skill 而变化 */
  onSkillLoaded?: (skill: LoadedSkill) => void
}

export interface RunRequest {
  provider: ChatProvider
  /** 每轮重建 system prompt——能力面会随 skill 收窄，提示词得跟着变 */
  buildSystemPrompt: (capabilities: Capability[], loadedSkills: LoadedSkill[]) => string
  /** 从持久化历史装配出来的轮次（不含 system） */
  history: ChatTurn[]
  /** 起始能力面 */
  capabilities: Capability[]
  maxRounds: number
  /** 本次运行还允许出几张提问卡；用完之后 ask_user 一律驳回 */
  askBudget: number
  signal: AbortSignal
  handlers: RunHandlers
}

export type RunStop = 'text' | 'rounds' | 'budget' | 'ask'

export interface RunResult {
  rounds: number
  proposals: number
  loadedSkills: LoadedSkill[]
  stop: RunStop
}

export async function runAgentLoop({
  provider,
  buildSystemPrompt,
  history,
  capabilities,
  maxRounds,
  askBudget,
  signal,
  handlers,
}: RunRequest): Promise<RunResult> {
  const convo: ChatTurn[] = [...history]
  const loadedSkills: LoadedSkill[] = []
  let granted = capabilities
  let proposals = 0
  let toolChars = 0
  let effectiveMaxRounds = maxRounds
  let asksLeft = askBudget
  let asked = false

  for (let round = 0; round < effectiveMaxRounds; round++) {
    const system = buildSystemPrompt(granted, loadedSkills)
    // 双层守卫第一层：不允许的能力连 schema 都不下发
    const tools = granted.map((c) => c.schema)
    // 第二层：模型凭幻觉喊出没下发的名字，这里也拦得住
    const allowed = new Map(granted.map((c) => [c.name, c]))

    let text = ''
    const { toolCalls } = await collectRound(
      provider.streamChat([{ role: 'system', content: system }, ...convo], { signal, tools }),
      (delta) => {
        text += delta
        handlers.onTextDelta(text)
      },
    )

    const persistedCalls: MessageToolCall[] = toolCalls.map((c) => ({
      id: c.id,
      name: c.name,
      arguments: c.arguments,
    }))
    if (text || persistedCalls.length > 0) await handlers.onAssistantTurn(text, persistedCalls)

    if (toolCalls.length === 0) return { rounds: round + 1, proposals, loadedSkills, stop: 'text' }

    convo.push({ role: 'assistant', content: text, toolCalls })

    for (const call of toolCalls) {
      const capability = allowed.get(call.name)
      const push = async (content: string) => {
        convo.push({ role: 'tool', toolCallId: call.id, content })
        await handlers.onToolResult(call.id, call.name, content)
      }

      if (!capability) {
        // 把可用清单一并给出：只说"不可用"，模型只能靠猜——上一版实测它会
        // 转头让学生手动把数据贴进来，把一次运行时限制变成了用户的麻烦
        await push(
          `没有名为「${call.name}」的能力，本次可用的是：${[...allowed.keys()].join('、')}。从里面选一个，或者用已有信息作答。`,
        )
        continue
      }

      if (capability.kind === 'read') {
        if (toolChars >= TOOL_OUTPUT_BUDGET) {
          await push('本轮读取的数据已达上限，请用已有信息作答，不要再调用读取工具。')
          continue
        }
        const result = (await capability.execute?.(call.arguments)) ?? '{}'
        toolChars += result.length
        await push(result)

        const skill = detectLoadedSkill(result)
        if (skill && !loadedSkills.some((s) => s.manifest.name === skill.manifest.name)) {
          loadedSkills.push(skill)
          // 从**起始能力面**重新收窄，不是在当前面上再切一刀。
          // 后者会让一次会话里换用第二个 skill 时拿到两者的交集——
          // 界面说着"正在遵循 B"，B 声明的工具却被上一个 skill 挡掉了。
          // 该守的不变量是"不超过用户的起始面"，不是"越用越少"。
          granted = narrowForSkill(capabilities, skill.manifest).granted
          // 读 skill 本身花掉一轮，给它把预算补回来，否则声明 max_rounds 的 skill
          // 实际能干活的轮数总比它写的少一轮
          effectiveMaxRounds = Math.max(effectiveMaxRounds, round + 1 + skill.manifest.maxRounds)
          handlers.onSkillLoaded?.(skill)
        }
        continue
      }

      if (capability.kind === 'ask') {
        if (asksLeft <= 0) {
          // 追问是这个产品最容易滑进去的失败模式：一轮一句、每句都说"最后一个问题"。
          // 额度用完就把路堵死，逼它按默认值把东西做出来——写进提示词管不住，
          // 得由运行时管。
          await push(
            '本次对话的提问额度已用完，不再展示问题卡。请按合理默认值继续做出成品，' +
              '并在正文里写明你假设了什么，让用户看着实物纠正。',
          )
          continue
        }
        let outcome
        try {
          outcome = capability.ask?.(call.arguments)
        } catch {
          await push('参数 JSON 解析失败，请修正后重试')
          continue
        }
        if (!outcome?.request) {
          await push(`没有可展示的问题${outcome?.notes?.length ? `（${outcome.notes.join('；')}）` : ''}。请直接作答。`)
          continue
        }
        asksLeft--
        asked = true
        await handlers.onAsk(outcome.request)
        await push(
          [
            `问题卡已展示给用户（${outcome.request.questions.length} 问），本次回答到此结束，等待用户作答。`,
            outcome.notes?.length ? `未展示的部分：${outcome.notes.join('；')}——这些请自己按默认值定，不要再问。` : '',
            '不要重复提问，也不要在用户回答之前继续输出。',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        continue
      }

      let proposal: Proposal | null
      try {
        proposal = capability.parse?.(call.arguments) ?? null
      } catch {
        await push('参数 JSON 解析失败，请修正后重试')
        continue
      }
      if (!proposal) {
        await push('提案为空，未展示。请确认内容后重试或直接告知用户。')
        continue
      }
      await handlers.onProposal(proposal)
      proposals++
      await push('提案卡已展示给用户，等待用户在卡片上确认或编辑。不要重复调用，也不要声称已保存。')
    }

    // 停机等人。放在整轮的工具都处理完之后：这一轮里其余的调用也得拿到结果，
    // 否则历史里留下没有 tool 结果的 tool_call，下一次装配就是个非法序列。
    if (asked) return { rounds: round + 1, proposals, loadedSkills, stop: 'ask' }

    if (toolChars >= TOOL_OUTPUT_BUDGET && round === effectiveMaxRounds - 1) {
      return { rounds: round + 1, proposals, loadedSkills, stop: 'budget' }
    }
  }

  return { rounds: effectiveMaxRounds, proposals, loadedSkills, stop: 'rounds' }
}

/** read_skill 的结果尾行带标记，据此知道这一轮读进来的是哪个 skill */
function detectLoadedSkill(result: string): LoadedSkill | undefined {
  const at = result.lastIndexOf(SKILL_LOADED_MARKER)
  if (at === -1) return undefined
  const name = result.slice(at + SKILL_LOADED_MARKER.length).trim()
  return name ? getSkill(name) : undefined
}

/** 会话里已经读过哪些 skill（从历史里还原，用于重建 system prompt） */
export function loadedSkillsFromTurns(turns: ChatTurn[]): LoadedSkill[] {
  const out: LoadedSkill[] = []
  for (const turn of turns) {
    if (turn.role !== 'tool') continue
    const skill = detectLoadedSkill(turn.content)
    if (skill && !out.some((s) => s.manifest.name === skill.manifest.name)) out.push(skill)
  }
  return out
}

/**
 * 起始能力面：按会话里**最后读入**的那个 skill 收窄，刷新之后约束不会松掉。
 *
 * 取最后一个而不是依次相交：一次会话里换用第二个 skill 是正常操作
 * （"帮我排计划" → "顺便把活动栏压一下"），相交会让第二个 skill 声明的工具
 * 被第一个挡掉，而界面上明明写着"正在遵循"它。用户看到的是 agent 中途说
 * "这个能力没开放"然后改口让他手动贴数据。
 *
 * 安全上真正要守的是**不超过用户的起始面**——收窄始终以 base 为准，
 * skill 拿不到用户本来就没有的能力；写库仍然一律要用户在卡片上确认。
 */
export function narrowByLoadedSkills(base: Capability[], loaded: LoadedSkill[]): Capability[] {
  const active = loaded[loaded.length - 1]
  return active ? narrowForSkill(base, active.manifest).granted : base
}

async function collectRound(stream: AsyncIterable<StreamEvent>, onText: (delta: string) => void) {
  const toolCalls: ToolCallRequest[] = []
  for await (const event of stream) {
    if (event.type === 'text') onText(event.text)
    else toolCalls.push(...event.calls)
  }
  return { toolCalls }
}
