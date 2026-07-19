import type { Activity, EventItem, Task } from '@/types'
import { CATEGORY_COLOR } from '@/components/activities/ActivitiesView'

export interface TimelinePoint {
  id: string
  kind: 'exam' | 'deadline' | 'task' | 'activity-point'
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
}

export interface TimelineModel {
  rangeStart: Date
  rangeEnd: Date
  totalDays: number
  months: { label: string; days: number }[]
  spans: TimelineSpan[]
  points: TimelinePoint[]
}

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

/** 聚合活动跨度 + 事件/任务点为时间轴模型；范围至少覆盖 [今天-15天, 今天+60天] */
export function buildTimelineModel(activities: Activity[], events: EventItem[], tasks: Task[]): TimelineModel {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dates: Date[] = [new Date(today.getTime() - 15 * 86400000), new Date(today.getTime() + 60 * 86400000)]
  const spans: TimelineSpan[] = []
  for (const a of activities) {
    if (!a.startDate) continue
    const start = parseIso(a.startDate)
    const end = a.endDate ? parseIso(a.endDate) : null
    dates.push(start)
    if (end) dates.push(end)
    spans.push({
      id: a.id,
      label: a.title,
      start: a.startDate,
      end: a.endDate,
      colorClass: CATEGORY_COLOR[a.category],
    })
  }

  const points: TimelinePoint[] = []
  for (const e of events) {
    dates.push(parseIso(e.date))
    points.push({
      id: e.id,
      kind: e.type === 'exam' ? 'exam' : e.type === 'deadline' ? 'deadline' : 'activity-point',
      date: e.date,
      label: e.title,
    })
  }
  for (const t of tasks) {
    if (t.status !== 'pending') continue
    dates.push(parseIso(t.dueDate))
    points.push({ id: t.id, kind: 'task', date: t.dueDate, label: t.title })
  }

  const rangeStart = startOfMonth(new Date(Math.min(...dates.map((d) => d.getTime()))))
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())))
  const rangeEnd = addMonths(startOfMonth(maxDate), 1) // 到最后一个月的月末
  const totalDays = Math.max(dayDiff(rangeEnd, rangeStart), 1)

  const months: { label: string; days: number }[] = []
  let cursor = new Date(rangeStart)
  while (cursor < rangeEnd) {
    const next = addMonths(cursor, 1)
    const end = next < rangeEnd ? next : rangeEnd
    months.push({
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      days: dayDiff(end, cursor),
    })
    cursor = next
  }

  // 跨度按开始时间排序，进行中排前
  spans.sort((a, b) => {
    if (!a.end && b.end) return -1
    if (a.end && !b.end) return 1
    return a.start.localeCompare(b.start)
  })

  return { rangeStart, rangeEnd, totalDays, months, spans, points }
}

/** 日期 → 时间轴内百分比位置（0-100） */
export function datePct(iso: string, model: TimelineModel): number {
  const d = parseIso(iso)
  const offset = dayDiff(d, model.rangeStart)
  return (offset / model.totalDays) * 100
}

export function todayPct(model: TimelineModel): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const offset = dayDiff(today, model.rangeStart)
  return (offset / model.totalDays) * 100
}
