import type { Activity, EventItem, Task } from '@/types'
import { CATEGORY_COLOR } from '@/components/activities/ActivitiesView'

export type PointKind = 'exam' | 'deadline' | 'task'

export interface TimelinePoint {
  id: string
  date: string
  label: string
}

export interface TimelineSpan {
  id: string
  label: string
  start: string
  /** null = 进行中，延伸到范围右端 */
  end: string | null
  colorClass: string
  /** 防重叠堆叠后所在子行 */
  row: number
}

export interface TimelineModel {
  rangeStart: Date
  totalDays: number
  months: { label: string; startDay: number; days: number }[]
  spans: TimelineSpan[]
  spanRows: number
  points: Record<PointKind, TimelinePoint[]>
}

export const POINT_KINDS: PointKind[] = ['exam', 'deadline', 'task']

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

/** 聚合活动跨度 + 事件/任务点为泳道时间轴模型；范围至少覆盖 [今天-20天, 今天+70天] */
export function buildTimelineModel(activities: Activity[], events: EventItem[], tasks: Task[]): TimelineModel {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dates: Date[] = [new Date(today.getTime() - 20 * 86400000), new Date(today.getTime() + 70 * 86400000)]

  const rawSpans: Omit<TimelineSpan, 'row'>[] = []
  for (const a of activities) {
    if (!a.startDate) continue
    const start = parseIso(a.startDate)
    dates.push(start)
    if (a.endDate) dates.push(parseIso(a.endDate))
    rawSpans.push({ id: a.id, label: a.title, start: a.startDate, end: a.endDate, colorClass: CATEGORY_COLOR[a.category] })
  }

  const points: Record<PointKind, TimelinePoint[]> = { exam: [], deadline: [], task: [] }
  for (const e of events) {
    dates.push(parseIso(e.date))
    const kind: PointKind = e.type === 'exam' ? 'exam' : 'deadline'
    points[kind].push({ id: e.id, date: e.date, label: e.title })
  }
  for (const t of tasks) {
    if (t.status !== 'pending') continue
    dates.push(parseIso(t.dueDate))
    points.task.push({ id: t.id, date: t.dueDate, label: t.title })
  }

  const rangeStart = startOfMonth(new Date(Math.min(...dates.map((d) => d.getTime()))))
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))
  const rangeEnd = addMonths(startOfMonth(maxDate), 1)
  const totalDays = Math.max(dayDiff(rangeEnd, rangeStart), 1)

  // 月份分段
  const months: { label: string; startDay: number; days: number }[] = []
  let cursor = new Date(rangeStart)
  while (cursor < rangeEnd) {
    const next = addMonths(cursor, 1)
    const end = next < rangeEnd ? next : rangeEnd
    months.push({
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      startDay: dayDiff(cursor, rangeStart),
      days: dayDiff(end, cursor),
    })
    cursor = next
  }

  // 跨度堆叠（进行中排前）
  rawSpans.sort((a, b) => {
    if (!a.end && b.end) return -1
    if (a.end && !b.end) return 1
    return a.start.localeCompare(b.start)
  })
  const rowEndDay: number[] = []
  const spans: TimelineSpan[] = rawSpans.map((s) => {
    const startDay = dayDiff(parseIso(s.start), rangeStart)
    const endDay = s.end ? dayDiff(parseIso(s.end), rangeStart) : totalDays
    let row = rowEndDay.findIndex((e) => e <= startDay)
    if (row === -1) {
      row = rowEndDay.length
      rowEndDay.push(0)
    }
    rowEndDay[row] = endDay + 2 // 留点间隙
    return { ...s, row }
  })

  return { rangeStart, totalDays, months, spans, spanRows: Math.max(rowEndDay.length, 1), points }
}

/** 日期 → 距范围起点的天数 */
export function dayOffset(iso: string, rangeStart: Date): number {
  return dayDiff(parseIso(iso), rangeStart)
}

export function todayOffset(rangeStart: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dayDiff(today, rangeStart)
}

/** 缩放后按可读密度生成日期刻度（放大时更细）：返回 {offset, label} */
export function dayTicks(rangeStart: Date, totalDays: number, ppd: number): { offset: number; label: string }[] {
  // 标签最小间距 ~52px；据此决定隔几天打一个刻度
  const step = Math.max(1, Math.ceil(52 / ppd))
  const ticks: { offset: number; label: string }[] = []
  for (let d = 0; d <= totalDays; d += step) {
    const date = new Date(rangeStart)
    date.setDate(date.getDate() + d)
    ticks.push({ offset: d, label: `${date.getMonth() + 1}/${date.getDate()}` })
  }
  return ticks
}
