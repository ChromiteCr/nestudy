import type { EventCategory, GrowthEvent } from '@/types'
import { toneFor, type CanvasNodeData } from './canvas-model'

/**
 * 时间线的数据装配——**画板的第二种看法**：画板看关系（谁影响了谁），
 * 这里看疏密（什么时候发生、哪一段空着）。
 *
 * ## 这个文件不接收 `artifacts`，也不引 `@/lib/engine/depth`
 *
 * 这不是自律，是结构。`depthOf(event, artifacts)` 的第二个入参在这里根本不存在，
 * 所以「一段经历长到第几层」在类型上进不了 `TimelineModel`，渲染层也就拿不到它。
 *
 * 为什么要做到这一步：`depth.ts` 顶上写着「**这不是完成度，别做成进度条**」，
 * `CanvasView` 写着「第三层不加任何标记，**加个对勾就成了打分表**」。
 * 而在一条把所有经历并排铺开、共享同一坐标系的轴上，任何按层着色或加记号的做法
 * 都会立刻变成一张成绩单——一排深浅不一的条，眼睛自动读成排名。
 * 层在轴上只出现在两个**他自己触发**的地方（悬停、点开），不在默认渲染路径上。
 *
 * ## 不往 `buildCanvas` 里加分支
 *
 * 它的主体工作（持久化坐标覆写、边端点解析、未连接反思）在轴上全部作废，
 * 真正共用的只有 `toneFor` 和那几行类别过滤谓词。
 */

type Tone = CanvasNodeData['tone']

/** 长期事项：轴上的一段跨度 */
export interface TimelineSpan {
  id: string
  title: string
  start: string
  /** null = 进行中。条延伸到范围右端，右端渐隐 */
  end: string | null
  tone: Tone
  /**
   * 防重叠贪心打包后所在子行。**这是排版，不是排序，更不是排名**——
   * 行号只由开始日期和它与邻居的重叠关系决定，两者都是时间的属性。
   */
  row: number
  /** 距 rangeStart 的天数。在这里算完，view 就不必再 parse 一次日期 */
  startDay: number
  /** 进行中的一律是 totalDays（铺到范围右端） */
  endDay: number
}

/** 某一天里的一件短期事项 */
export interface TimelineDayEvent {
  id: string
  title: string
  category: EventCategory
  tone: Tone
  /**
   * 挂靠的长期事项标题。详情卡里写一行，**不参与布局**：
   * 纵坐标已经被防重叠打包占用了，再塞一个语义进去的结果是两个都读不出来。
   */
  parentTitle: string | null
}

/**
 * 短期事项按天合并成的一个落点。
 *
 * **一天一个点，不是一件一个点。** 同一天三个 DDL 在默认缩放下像素完全重合，
 * 只有最后渲染的那个点得开；合并之后这个洞不存在，而且顺手让事项道恒为单行——
 * 不需要第二套堆叠算法，也不会因为某天挤了五件事把下面的道顶下去。
 *
 * **点上不写数字**：写个「3」就成了计数。当天有哪些，点开才列。
 */
export interface TimelineDay {
  date: string
  /** 距 rangeStart 的天数 */
  day: number
  events: TimelineDayEvent[]
  /** 当天只有一条时用它的类别色；多于一条走 null（无彩）——用其中任意一件的颜色都是撒谎 */
  tone: Tone | null
}

export interface TimelineMonth {
  label: string
  /** 窄到放不下 `label` 时用它（「9月」）。降级由 view 按实际盒宽决定 */
  short: string
  startDay: number
  days: number
}

export interface TimelineModel {
  rangeStart: Date
  totalDays: number
  months: TimelineMonth[]
  spans: TimelineSpan[]
  /** 跨度道占几个子行，至少 1：空道会塌成 8px，泳道标签被压没 */
  spanRows: number
  days: TimelineDay[]
  /**
   * 真实内容占据的天区间（**不含**兜底的 today−20 / today+70）。
   *
   * 初始视口锚在这个区间里离今天最近的那一天，**不无条件锚今天**——
   * 一次性补录两年前的旧经历时，锚今天会让学生进轴先看到一屏空白，
   * 要往左滚六七屏才看到自己刚导入的东西。
   */
  content: { startDay: number; endDay: number } | null
  /**
   * 没写日期、上不了轴的长期事项条数。
   *
   * 长期事项**可以带空 startDate 落库**（提案解析只对短期做 ISO 守卫）。
   * 静默丢掉会让轴看起来比实际更稀疏，而**稀疏正是这个视图要被读出来的东西**——
   * 所以要在轴外陈述一句。措辞是「不在轴上」（关于轴的事实），
   * 不是「缺日期」（关于他的缺陷）。
   */
  undatedLong: number
  /** 被类别筛选挡掉的件数。轴上的空白必须能被区分成「本来就没有」还是「筛掉了」 */
  hiddenByFilter: number
  isEmpty: boolean
}

interface BuildInput {
  growthEvents: GrowthEvent[]
  /** 空集合 = 全部。谓词与 `buildCanvas` 里那条逐字相同 */
  categoryFilter: Set<EventCategory>
}

/** 范围至少覆盖 [今天−20, 今天+70]。S3a 定的口径，原样保留 */
const MIN_LEAD_DAYS = 20
const MIN_TAIL_DAYS = 70
const DAY_MS = 86400000

/**
 * 日期刻度标签的最小间距，`dayTicks` 据此反解隔几天打一个。
 *
 * 52 是按 10px 字号的 `M/D` 标签量出来的。刻度走 `<Mono>`（`text-[0.86em]`），
 * 父容器 `text-[11px]` 时实际字号 9.5px，这个反解仍成立——
 * **改刻度容器的字号就要同步改这个常量。**
 */
const TICK_MIN_GAP = 52

/**
 * ISO → Date；空串 / 缺位 / 畸形一律返回 null，由调用方跳过。
 *
 * **一条脏日期能让整张轴白屏，不是少一条。** 旧实现在这里产出 Invalid Date，
 * 一路把 `Math.min(...dates.map(getTime))` 变成 NaN，rangeStart / totalDays /
 * 所有 dayOffset 全塌。守卫下沉到 parse 本身，比在每个调用点各写一次
 * `if (!e.startDate) continue` 可靠：备份导入或迁移带进一条非空但畸形的日期
 * （`'2026/08/28'`）时，真值判断挡不住，这里挡得住。
 *
 * 解构三段取**本地日历日**，不用 `new Date(iso)`——那个按 UTC 解析，跨时区差一天。
 */
function parseIso(iso: string): Date | null {
  const parts = iso.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? null : date
}

// 以下三个是纯几何，只吃 Date，从 S3a 的实现原样搬
function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

export function buildTimeline({ growthEvents, categoryFilter }: BuildInput): TimelineModel {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 兜底两端。它同时保证 dates 恒有 ≥2 个元素——空数组喂给 Math.min 会得 Infinity
  const dates: Date[] = [
    new Date(today.getTime() - MIN_LEAD_DAYS * DAY_MS),
    new Date(today.getTime() + MIN_TAIL_DAYS * DAY_MS),
  ]
  /** 只装真实内容的时间戳。初始视口要落在「有东西的地方」，不能被上面两个兜底日期带偏 */
  const contentAt: number[] = []

  const titleById = new Map(growthEvents.map((e) => [e.id, e.title]))
  const rawSpans: Omit<TimelineSpan, 'row' | 'startDay' | 'endDay'>[] = []
  const byDate = new Map<string, GrowthEvent[]>()
  let undatedLong = 0
  let hiddenByFilter = 0

  /*
    一条 kind 判断，不是三条：GrowthEvent 一张表，long → 跨度，short → 点。

    **不按 status 过滤。** 短期 status 恒为 'pending'（全 app 没有把它改成 done
    的地方），滤它是空转；而轴看的是疏密，把已完成的短期事项滤掉，
    正好把「这段时间做过什么」抹掉。
  */
  for (const e of growthEvents) {
    if (categoryFilter.size > 0 && !categoryFilter.has(e.category)) {
      hiddenByFilter++
      continue
    }
    const start = parseIso(e.startDate)
    if (!start) {
      if (e.kind === 'long') undatedLong++
      continue
    }
    dates.push(start)
    contentAt.push(start.getTime())

    if (e.kind === 'long') {
      const end = e.endDate ? parseIso(e.endDate) : null
      if (end) {
        dates.push(end)
        contentAt.push(end.getTime())
      } else {
        // 进行中的条一路铺到范围右端；对「哪里有东西」来说它延伸到今天
        contentAt.push(today.getTime())
      }
      rawSpans.push({
        id: e.id,
        title: e.title,
        start: e.startDate,
        end: end ? e.endDate : null,
        tone: toneFor(e.category),
      })
    } else {
      // category:'application' 的事项直接读 startDate 就够——那已经是换算过的
      // 北京日历日。**别在这里再调一次 resolveDeadline**：那是抽屉倒计时的口径
      // （带时刻和时区），两边会给出同一件事的两个日期
      const bucket = byDate.get(e.startDate)
      if (bucket) bucket.push(e)
      else byDate.set(e.startDate, [e])
    }
  }

  const rangeStart = startOfMonth(new Date(Math.min(...dates.map((d) => d.getTime()))))
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))
  const rangeEnd = addMonths(startOfMonth(maxDate), 1)
  // 最后那个 Math.max 是除零保护，画布宽度与所有 dayX 都靠它
  const totalDays = Math.max(dayDiff(rangeEnd, rangeStart), 1)

  // 月份分段。含跨年那一支，重写必漏
  const months: TimelineMonth[] = []
  let cursor = new Date(rangeStart)
  while (cursor < rangeEnd) {
    const next = addMonths(cursor, 1)
    const end = next < rangeEnd ? next : rangeEnd
    months.push({
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      short: `${cursor.getMonth() + 1}月`,
      startDay: dayDiff(cursor, rangeStart),
      days: dayDiff(end, cursor),
    })
    cursor = next
  }

  /*
    只按开始日期排，**去掉旧实现里的「进行中排前」**。那个 key 会让一段经历
    一填上 endDate 就换行号、换行——版面位置因为「做完了」而变动，读起来就是
    名次动了。而且贪心打包本来就要求 start 升序，那个 key 还破坏了它的前提。
    id 兜底是为了同日多条时顺序稳定。
  */
  rawSpans.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))

  const rowEndDay: number[] = []
  const spans: TimelineSpan[] = rawSpans.map((s) => {
    const startAt = parseIso(s.start)
    const startDay = startAt ? dayDiff(startAt, rangeStart) : 0
    const endAt = s.end ? parseIso(s.end) : null
    // endDate 早于 startDate 的脏数据（模型填反）会让条反向；夹到 startDay
    // 让它退化成单日条，再由 view 的最小宽度兜住可点性
    const endDay = endAt ? Math.max(dayDiff(endAt, rangeStart), startDay) : totalDays
    let row = rowEndDay.findIndex((d) => d <= startDay)
    if (row === -1) {
      row = rowEndDay.length
      rowEndDay.push(0)
    }
    rowEndDay[row] = endDay + 2 // 留 2 天间隙，防两条视觉上贴成一条
    return { ...s, row, startDay, endDay }
  })

  const days: TimelineDay[] = []
  for (const [date, list] of byDate) {
    const at = parseIso(date)
    if (!at) continue // 能进 byDate 的都 parse 过了；这行是给类型收窄用的
    const first = list[0]
    days.push({
      date,
      day: dayDiff(at, rangeStart),
      tone: list.length === 1 && first ? toneFor(first.category) : null,
      events: list.map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        tone: toneFor(e.category),
        // parentId 让短期点说得出它属于哪段经历——这是轴比图强的一处关系表达，
        // 图上这条关系今天根本没画
        parentTitle: e.parentId ? (titleById.get(e.parentId) ?? null) : null,
      })),
    })
  }
  days.sort((a, b) => a.day - b.day)

  const content = contentAt.length
    ? {
        startDay: dayDiff(new Date(Math.min(...contentAt)), rangeStart),
        endDay: dayDiff(new Date(Math.max(...contentAt)), rangeStart),
      }
    : null

  return {
    rangeStart,
    totalDays,
    months,
    spans,
    spanRows: Math.max(rowEndDay.length, 1),
    days,
    content,
    undatedLong,
    hiddenByFilter,
    isEmpty: spans.length === 0 && days.length === 0,
  }
}

export function todayOffset(rangeStart: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dayDiff(today, rangeStart)
}

/** 缩放后按可读密度生成日期刻度：标签最小间距 ~52px，据此反解隔几天打一个 */
export function dayTicks(
  rangeStart: Date,
  totalDays: number,
  ppd: number,
): { offset: number; label: string }[] {
  const step = Math.max(1, Math.ceil(TICK_MIN_GAP / ppd))
  const ticks: { offset: number; label: string }[] = []
  for (let d = 0; d <= totalDays; d += step) {
    const date = new Date(rangeStart)
    date.setDate(date.getDate() + d)
    ticks.push({ offset: d, label: `${date.getMonth() + 1}/${date.getDate()}` })
  }
  return ticks
}
