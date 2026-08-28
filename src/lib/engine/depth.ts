import type { Artifact, GrowthEvent } from '@/types'

/**
 * 一段经历**长到第几层**。
 *
 * 三层不是「记得多完整」，是「**从这件事里拿到了什么**」：
 *
 * | 层 | 回答的问题 | 判据 |
 * |---|---|---|
 * | 1 | 发生过什么 | 事项本身存在 |
 * | 2 | 我具体做了什么、卡在哪 | 有 description/achievements，或有一份关联的反思 |
 * | 3 | 下次会怎么做 | 关联的反思里有 `takeaway` |
 *
 * **这不是完成度，别做成进度条。** 有些活动做完就是做完了，第三层空着不是缺陷，
 * 是「这件事还没被消化」——而没被消化也可能是对的选择。真正有害的是让学生
 * 为了填满格子去编一段成长，所以界面上的措辞必须是**陈述**（哪些空着）
 * 而不是催促（你完成了百分之几）。
 *
 * 为什么第三层认 `takeaway` 这个字段而不是从正文里找关键词：正则猜「下次会怎么做」
 * 又不准又没法回溯，而这一层将来要在他做同类事情时**原样推回给他**，
 * 必须精确取得到。见 `types.ts` 里 `Artifact.takeaway` 的注释。
 */

export type GrowthDepth = 1 | 2 | 3

export interface EventDepth {
  depth: GrowthDepth
  /** 短标签，画板节点和时间线上用 */
  label: string
  /** 还差的那一层是什么；已经到第三层就是 null */
  missing: string | null
  /** 第三层的原话，有就给——第 18 项要拿它回推 */
  takeaway: string | null
}

const LAYER: Record<GrowthDepth, { label: string; missing: string | null }> = {
  // 措辞刻意是陈述句。「只有履历」是事实，「还没写反思」是催促
  1: { label: '只有履历', missing: '做了什么、卡在哪' },
  2: { label: '有经过', missing: '下次会怎么做' },
  3: { label: '有下次怎么做', missing: null },
}

const filled = (v: string | undefined | null) => typeof v === 'string' && v.trim().length > 0

/** 关联到这个事项的反思。`linkedNodeIds` 用的是 `event:<id>` 这个命名空间 */
function reflectionsOf(event: GrowthEvent, artifacts: Artifact[]): Artifact[] {
  const nodeId = `event:${event.id}`
  return artifacts.filter((a) => a.kind === 'reflection' && a.linkedNodeIds.includes(nodeId))
}

/**
 * 最近一次写下的「下次会怎么做」，连同**写下的时间**。
 *
 * 多份反思都写了 takeaway 时用最新的那条——人是会改主意的，
 * 最近一次的说法才是他现在的想法。时间要一起带出来是因为 `priorTakeaway`
 * 要按「这句话是什么时候想明白的」排序，而不是按那段经历什么时候发生。
 */
function latestTakeaway(linked: Artifact[]): { text: string; at: number } | null {
  const said = linked.filter((a) => filled(a.takeaway)).sort((a, b) => b.createdAt - a.createdAt)[0]
  return said?.takeaway ? { text: said.takeaway.trim(), at: said.createdAt } : null
}

export function depthOf(event: GrowthEvent, artifacts: Artifact[]): EventDepth {
  const linked = reflectionsOf(event, artifacts)
  const takeaway = latestTakeaway(linked)?.text ?? null

  const hasProcess =
    filled(event.description) ||
    (event.achievements?.length ?? 0) > 0 ||
    linked.some((a) => filled(a.content))

  const depth: GrowthDepth = takeaway ? 3 : hasProcess ? 2 : 1
  return { depth, ...LAYER[depth], takeaway }
}

/**
 * 一批事项里，哪些还停在第一层。
 *
 * 给提醒引擎和时间线用。**只看已经结束的**：还在进行中的事项没长出东西
 * 完全正常，对着它说「还停在做过」是在催一件还没做完的事。
 */
export function shallowEvents(events: GrowthEvent[], artifacts: Artifact[]): GrowthEvent[] {
  return events.filter((e) => e.kind === 'long' && e.endDate && depthOf(e, artifacts).depth === 1)
}

/**
 * **上一次做同类的事情时，他自己写下的那句「下次会怎么做」。**
 *
 * 这是规划第 18 项——「让记录回到决策现场」——的取数口。整个「记录」阶段的收口
 * 就在这里：前面做的一切让学生有了一份好读的记录，但如果它只是躺着，
 * 那它仍然只是一张摆得好看的素材表（**郭老师原话：跟 word 没有区别，
 * 就是填起来方便一些而已**）。记录要真的帮到人，就得在他**下一次做决定的时候**
 * 自己冒出来，而不是等他想起来去翻。
 *
 * 三条筛选，每条都是为了让「上次做 X 你写过」这句话**字面为真**：
 *
 * - 同 `category`：跨类别的经验多半迁移不过去，硬推就成了套话
 * - `startDate <= 新事项的 startDate`：「上次」必须真的在前面，否则是在拿后来的事教前面的事
 * - 排序按**那句话写下的时间**，不按经历的时间：同一段经历隔一年再回看会写出不一样的话，
 *   最近想明白的那句才是该推的
 *
 * 返回原话本身，不做任何加工——转述一次，那句话就不再是他的了。
 */
export interface PriorTakeaway {
  /** 说这句话时做的那件事 */
  event: GrowthEvent
  /** 他的原话，一个字没动 */
  takeaway: string
}

export function priorTakeaway(
  event: GrowthEvent,
  events: GrowthEvent[],
  artifacts: Artifact[],
): PriorTakeaway | null {
  const candidates = events
    .filter((e) => e.kind === 'long' && e.id !== event.id && e.category === event.category)
    .filter((e) => e.startDate <= event.startDate)
    .map((e) => ({ event: e, said: latestTakeaway(reflectionsOf(e, artifacts)) }))
    .filter((c): c is { event: GrowthEvent; said: { text: string; at: number } } => c.said !== null)
    .sort((a, b) => b.said.at - a.said.at)

  const best = candidates[0]
  return best ? { event: best.event, takeaway: best.said.text } : null
}
