import { daysUntil } from '@/lib/db/dates'
import type { EventCategory, GrowthEvent, MainLine, MainlineCategory } from '@/types'

/**
 * 他自己写的那条线，和他最近记下的东西，对不对得上。
 *
 * **主线是他填的，不是算出来的。** 这个文件做的全部事情是把两样东西并排摆出来数一遍：
 * 一段长期经历的 `category` 在不在他勾的那几类里，或者他自己按过的那个按钮说了什么。
 * 不算相似度、不抽关键词、不给分。返回值里没有比例、没有分数、没有任何形容词——
 * **「这算不算偏离」是他的判断，不是这个函数的返回值。**
 *
 * ## 和 `capabilities/research/dedupe.ts` 划清界限
 *
 * 那边拿字面重合度做归并，而它自己的注释已经承认阈值区间重叠、
 * 「语义归并是模型的活，这里不装作能做」。这里**连一个字符串相似度计算都没有**：
 * 比的是集合成员关系，和他自己按过的那个按钮。两者不共用代码、不互相调用。
 *
 * ## 返回 null 就是不出声
 *
 * null 有六种来路——没设主线 / 类别口径没被锚定 / 窗口内没东西 /
 * 不在线上的不够 3 件 / 在线上的超过 1 件 / 全是补录。
 * 它们在界面上是同一种表现：**什么都不发生**。对得上的时候也不出声，
 * 没有「你很专注，继续保持」——到位了就该安静，加个记号就成了打分表。
 */

export type DriftBasis = 'marked' | 'category'

export interface MainlineDrift {
  /** 窗口内判为「在线上」的条数 */
  on: number
  /** 窗口内判为「不在线上」的那些，按 createdAt 倒序 */
  off: GrowthEvent[]
  /** 这份名单是拿什么数出来的。'marked' = 全部来自他自己按的按钮 */
  basis: DriftBasis
  /** 他勾的类别，去重保序。文案里必须摊开，让他能归因到「是不是我勾错了」 */
  declared: MainlineCategory[]
}

/** 往回数多久新建的长期事项。取值理由见 `WINDOW_DAYS` 那段 */
const WINDOW_DAYS = 30
/** 不在线上的少于这个数，一律不出声 */
const MIN_OFF = 3
/** 在线上的超过这个数，一律不出声 */
const MAX_ON = 1
/** 他勾的类别在全历史里至少命中这么多条，类别口径才被授权 */
const ANCHOR_MIN = 2

/**
 * 模型的静默兜底值（`parseEventsArgs` 里长期事项没给或给错 category 时填 `'other'`）。
 *
 * 它既不算命中也不算不命中，**直接不参与**：一堆 `other` 可能是模型偷懒的产物，
 * 不是他真做了杂事，拿它去指着一段经历说「不在你的线上」，是把模型的抖动算到他头上。
 */
const MODEL_FALLBACK: EventCategory = 'other'

/** 还没结束的长期事项。已经结束的多半是补录历史（同 R7 的那条判断） */
const isActive = (e: GrowthEvent) => !e.endDate || daysUntil(e.endDate) >= 0

/** 他勾的类别去重保序。用 includes 不用 Set，是为了让顺序稳定——文案里要按这个顺序念 */
function declaredOf(mainlines: MainLine[]): MainlineCategory[] {
  const out: MainlineCategory[] = []
  for (const m of mainlines) for (const c of m.categories) if (!out.includes(c)) out.push(c)
  return out
}

/**
 * 他勾了、但在**全部**长期记录里一条都没对上的类别。
 *
 * 只给设置页那一行口径自检用，**不进提醒条**：这句话讲的是「口径对不对得上」，
 * 不是「他偏没偏」；而且它该在他自己来看档案的时候出现，不该被推到他面前。
 * 它同时是下面那道锚定闸对学生可见的解释——否则那道闸就是一个
 * 「我怎么什么都没收到」的黑箱。
 */
export function unmatchedCategories(mainlines: MainLine[], events: GrowthEvent[]): MainlineCategory[] {
  const longs = events.filter((e) => e.kind === 'long')
  return declaredOf(mainlines).filter((c) => !longs.some((e) => e.category === c))
}

export function mainlineDrift(
  mainlines: MainLine[],
  events: GrowthEvent[],
  /** `settings.mainlineShownAt`；没摆过传 undefined */
  shownAt: number | undefined,
  now = Date.now(),
): MainlineDrift | null {
  // 没设主线：一个字都不出。不是「等他设」，是这个函数在这里就返回。
  // **不催他设主线**——催他设，本身就是在替他决定「你应该有一条主线」
  if (mainlines.length === 0) return null

  const longs = events.filter((e) => e.kind === 'long' && e.status !== 'archived')
  const declared = declaredOf(mainlines)
  const declaredSet = new Set<MainlineCategory>(declared)

  /**
   * **锚定闸：他勾的类别必须在他已有的记录里真的出现过，类别口径才被授权。**
   *
   * 一条都没对上时，最可能的解释不是「他偏了」，而是「他勾的类和记录的分类根本对不上」——
   * 跨类的主线（「用计算机做教育公平的事」横跨科研／志愿／领导力，他只勾了一类），
   * 或者模型把一整批经历打成了另一个标签。这两种情况下拿类别去指着他的记录说话，
   * 错的概率高于对的，而这一项最怕的正是「AI 一本正经地说你偏了」：
   * 屏幕上是一句语气笃定的「3 件不在这条线上」，**学生不会怀疑分类，他会怀疑自己**。
   *
   * 锚点数全历史、不受窗口限制：这道闸问的是「这个口径靠不靠谱」，
   * 不是「他最近在干什么」。
   */
  const anchored =
    declaredSet.size > 0 && longs.filter((e) => declaredSet.has(e.category as MainlineCategory)).length >= ANCHOR_MIN

  /**
   * 窗口起点取「上次摆过」和「30 天前」里更晚的那个——一个表达式同时做了冷却
   * 和「同一批记录不会被摆第二次」。没有这一条，他关掉之后第二天再记一条，
   * 按天过期的 `dismissedReminders` 一失效，同一份名单原样再来一次。
   */
  const from = Math.max(shownAt ?? 0, now - WINDOW_DAYS * 86400000)
  const recent = longs.filter((e) => e.createdAt >= from && isActive(e))

  let on = 0
  const off: GrowthEvent[] = []
  for (const e of recent) {
    // 他自己按的按钮永远压过我们对 category 的读法，而且不受锚定闸约束
    if (e.mainlineMark === 'on') {
      on++
      continue
    }
    if (e.mainlineMark === 'off') {
      off.push(e)
      continue
    }
    if (!anchored) continue
    if (e.category === MODEL_FALLBACK) continue
    if (declaredSet.has(e.category as MainlineCategory)) on++
    else off.push(e)
  }

  /**
   * 出声条件是**两个绝对数，不是比例**。
   *
   * 比例判据对「漂移刚开始」结构性失聪：底子越厚，新漂移被稀释得越狠——
   * 已经攒了 5 条主线内记录的学生，最近 3 件全岔开也只有 3/8 = 37.5%，
   * 等多久都到不了六成。而那恰恰是这条提醒唯一有价值的时刻。
   *
   * `MIN_OFF = 3`：1 件不在很正常，2 件也是，摆出来就是挑刺；3 是「这不止一次」的最小量。
   *
   * `MAX_ON = 1` 是绝对数的安全带。光有 `off >= 3` 会误伤「同时有几摊事」的常态高中生
   * （课内一条、活动一条，谁都这么过）。加上它，判据才从「他做了不少线外的事」
   * 收紧到「**这一阵他基本没在这条线上记东西**」——那是一句能直说、
   * 也经得起他当场反驳的话。
   */
  if (off.length < MIN_OFF || on > MAX_ON) return null

  off.sort((a, b) => b.createdAt - a.createdAt)
  return {
    on,
    off,
    basis: off.every((e) => e.mainlineMark === 'off') ? 'marked' : 'category',
    declared,
  }
}
