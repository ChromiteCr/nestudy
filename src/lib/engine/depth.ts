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

export function depthOf(event: GrowthEvent, artifacts: Artifact[]): EventDepth {
  const linked = reflectionsOf(event, artifacts)
  // 取第一条有原话的。多份反思都写了 takeaway 时用最新的那条——
  // 人是会改主意的，最近一次的说法才是他现在的想法
  const takeaway =
    linked
      .filter((a) => filled(a.takeaway))
      .sort((a, b) => b.createdAt - a.createdAt)[0]?.takeaway?.trim() ?? null

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
