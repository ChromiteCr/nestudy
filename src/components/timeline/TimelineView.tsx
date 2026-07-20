import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarX, GraduationCap, ListTodo, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { daysUntil } from '@/lib/db/planning'
import { cn } from '@/lib/utils'
import type { AppView } from '@/types'
import { buildTimelineModel, dayOffset, POINT_KINDS, todayOffset, type PointKind } from './timeline-model'

const POINT_STYLE: Record<PointKind, { icon: typeof CalendarX; dot: string; text: string; label: string }> = {
  exam: { icon: GraduationCap, dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', label: '考试' },
  deadline: { icon: CalendarX, dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: '截止' },
  task: { icon: ListTodo, dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', label: '任务' },
}

const LANE_LABEL_W = 60
const SPAN_ROW_H = 26
const POINT_ROW_H = 30
const MIN_PPD = 3
const MAX_PPD = 26
const DEFAULT_PPD = 8

interface TimelineViewProps {
  onNavigate: (view: AppView) => void
}

/** 学期鸟瞰：横向泳道时间轴（活动跨度 / 考试 / 截止 / 任务各一泳道），支持缩放 */
export function TimelineView({ onNavigate }: TimelineViewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const events = usePlanningStore((s) => s.events)
  const tasks = usePlanningStore((s) => s.tasks)

  const model = useMemo(() => buildTimelineModel(activities, events, tasks), [activities, events, tasks])
  const isEmpty = model.spans.length === 0 && POINT_KINDS.every((k) => model.points[k].length === 0)

  const [ppd, setPpd] = useState(DEFAULT_PPD)
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = model.totalDays * ppd
  const dayX = (offset: number) => offset * ppd
  const tOffset = todayOffset(model.rangeStart)

  // 缩放：ctrl/⌘ + 滚轮（含触控板捏合）以光标为锚点缩放
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cursorX = e.clientX - rect.left + el.scrollLeft - LANE_LABEL_W
    const dayAtCursor = cursorX / ppd
    const next = Math.min(MAX_PPD, Math.max(MIN_PPD, ppd * (e.deltaY < 0 ? 1.12 : 0.89)))
    setPpd(next)
    requestAnimationFrame(() => {
      el.scrollLeft = dayAtCursor * next - (e.clientX - rect.left - LANE_LABEL_W)
    })
  }

  const zoomBtn = (dir: 1 | -1) => {
    const el = scrollRef.current
    const anchorDay = el ? (el.scrollLeft + el.clientWidth / 2 - LANE_LABEL_W) / ppd : tOffset
    const next = Math.min(MAX_PPD, Math.max(MIN_PPD, ppd * (dir === 1 ? 1.25 : 0.8)))
    setPpd(next)
    requestAnimationFrame(() => {
      if (el) el.scrollLeft = anchorDay * next - (el.clientWidth - LANE_LABEL_W) / 2
    })
  }

  // 打开时把「今天」滚到视口约 1/3 处
  useEffect(() => {
    const el = scrollRef.current
    if (!el || isEmpty) return
    el.scrollLeft = Math.max(0, dayX(tOffset) - el.clientWidth / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">时间轴</h1>
          <p className="text-sm text-muted-foreground">学期鸟瞰 · 活动、考试、DDL 与任务的全局视图</p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" aria-label="缩小" onClick={() => zoomBtn(-1)}>
              <Minus className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-7" aria-label="放大" onClick={() => zoomBtn(1)}>
              <Plus className="size-3.5" />
            </Button>
          </div>
        )}
      </header>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            还没有可展示的内容。添加活动、考试或任务后，这里会出现完整时间轴。
          </p>
        </div>
      ) : (
        <div ref={scrollRef} onWheel={onWheel} className="min-h-0 flex-1 overflow-auto">
          <div className="relative" style={{ width: width + LANE_LABEL_W, minWidth: '100%' }}>
            {/* 月份表头（粘顶） */}
            <div className="sticky top-0 z-20 flex h-7 border-b bg-background" style={{ paddingLeft: LANE_LABEL_W }}>
              {model.months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-7 items-center border-l pl-1.5 text-xs font-medium text-muted-foreground"
                  style={{ left: LANE_LABEL_W + dayX(m.startDay), width: dayX(m.days) }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* 今日竖线（贯穿所有泳道） */}
            {tOffset >= 0 && tOffset <= model.totalDays && (
              <div
                className="pointer-events-none absolute bottom-0 top-7 z-10 w-px bg-primary/70"
                style={{ left: LANE_LABEL_W + dayX(tOffset) }}
              >
                <span className="absolute top-0 -translate-x-1/2 rounded bg-primary px-1 text-[9px] leading-tight text-primary-foreground">
                  今天
                </span>
              </div>
            )}

            {/* 活动泳道 */}
            <Lane label="活动" heightPx={model.spanRows * SPAN_ROW_H + 8}>
              {model.spans.map((s) => {
                const left = Math.max(dayX(dayOffset(s.start, model.rangeStart)), 0)
                const right = s.end ? dayX(dayOffset(s.end, model.rangeStart)) : width
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onNavigate('activities')}
                    title={s.label}
                    className={cn(
                      'absolute flex h-5 items-center overflow-hidden rounded px-1.5 text-[11px] text-white',
                      s.colorClass,
                      !s.end && 'opacity-80',
                    )}
                    style={{ left, width: Math.max(right - left, 6), top: s.row * SPAN_ROW_H + 4 }}
                  >
                    <span className="truncate">{s.label}</span>
                  </button>
                )
              })}
            </Lane>

            {/* 考试 / 截止 / 任务泳道 */}
            {POINT_KINDS.map((kind) => {
              const pts = model.points[kind]
              if (pts.length === 0) return null
              const style = POINT_STYLE[kind]
              return (
                <Lane key={kind} label={style.label} heightPx={POINT_ROW_H}>
                  {pts.map((p) => {
                    const x = dayX(dayOffset(p.date, model.rangeStart))
                    const diff = daysUntil(p.date)
                    const showLabel = ppd >= 10
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onNavigate('tasks')}
                        title={`${p.label} · ${diff < 0 ? `逾期${-diff}天` : diff === 0 ? '今天' : `${diff}天后`}`}
                        className="group absolute top-1/2 flex -translate-y-1/2 items-center gap-1"
                        style={{ left: x }}
                      >
                        <span className={cn('size-2.5 shrink-0 rounded-full ring-2 ring-background', style.dot)} />
                        {showLabel && (
                          <span className="max-w-32 truncate whitespace-nowrap text-[11px] text-foreground/80">
                            {p.label}
                          </span>
                        )}
                        {!showLabel && (
                          <span className="pointer-events-none absolute left-3 top-4 z-30 hidden whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[10px] shadow ring-1 ring-border group-hover:block">
                            {p.label}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </Lane>
              )
            })}
          </div>
        </div>
      )}

      {!isEmpty && (
        <div className="flex flex-wrap items-center gap-3 border-t px-6 py-2 text-xs text-muted-foreground">
          {POINT_KINDS.map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={cn('size-2.5 rounded-full', POINT_STYLE[k].dot)} />
              {POINT_STYLE[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded bg-slate-400" />
            活动跨度
          </span>
          <span className="ml-auto">⌘/Ctrl + 滚轮缩放</span>
        </div>
      )}
    </div>
  )
}

function Lane({ label, heightPx, children }: { label: string; heightPx: number; children: React.ReactNode }) {
  return (
    <div className="relative border-b" style={{ height: heightPx, paddingLeft: LANE_LABEL_W }}>
      <div className="sticky left-0 z-20 float-left flex h-full items-center bg-background/95 pr-1 text-xs font-medium text-muted-foreground" style={{ width: LANE_LABEL_W, marginLeft: -LANE_LABEL_W }}>
        {label}
      </div>
      {children}
    </div>
  )
}
