import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarX, GraduationCap, ListTodo, Minus, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { daysUntil } from '@/lib/db/planning'
import { cn } from '@/lib/utils'
import { ACTIVITY_CATEGORY_LABEL, ACTIVITY_LEVEL_LABEL, type AppView } from '@/types'
import {
  buildTimelineModel,
  dayOffset,
  dayTicks,
  POINT_KINDS,
  todayOffset,
  type PointKind,
} from './timeline-model'

const POINT_STYLE: Record<PointKind, { icon: typeof CalendarX; dot: string; text: string; label: string }> = {
  exam: { icon: GraduationCap, dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', label: '考试' },
  deadline: { icon: CalendarX, dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: '截止' },
  task: { icon: ListTodo, dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', label: '任务' },
}

const LANE_LABEL_W = 60
const SPAN_ROW_H = 30
const POINT_ROW_H = 40
const HEADER_H = 42
const MIN_PPD = 3
const MAX_PPD = 32
const DEFAULT_PPD = 9
const DOT_R = 6
/** 卡片与被点项目之间的留白 */
const GAP = 8
/** 卡片假定宽度，用于视口边界裁剪（对应 w-60） */
const CARD_W = 240
/** 到期超过此天数的任务视为"长期任务"，画引导线 */
const LONG_TERM_DAYS = 14

type Selected =
  | { type: 'span'; id: string; anchorX: number; anchorY: number }
  | { type: 'point'; kind: PointKind; id: string; anchorX: number; anchorY: number }
  | null

interface TimelineViewProps {
  onNavigate: (view: AppView) => void
}

/** 学期鸟瞰：横向泳道时间轴，缩放显示更细日期刻度，点击项目在其右上角弹出详情卡 */
export function TimelineView({ onNavigate }: TimelineViewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const events = usePlanningStore((s) => s.events)
  const tasks = usePlanningStore((s) => s.tasks)

  const model = useMemo(() => buildTimelineModel(activities, events, tasks), [activities, events, tasks])
  const isEmpty = model.spans.length === 0 && POINT_KINDS.every((k) => model.points[k].length === 0)

  const [ppd, setPpd] = useState(DEFAULT_PPD)
  const [selected, setSelected] = useState<Selected>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const width = model.totalDays * ppd
  const dayX = (offset: number) => offset * ppd
  const tOffset = todayOffset(model.rangeStart)
  const ticks = useMemo(() => dayTicks(model.rangeStart, model.totalDays, ppd), [model, ppd])
  const showTicks = ppd >= 7

  // 各泳道相对 innerRef 的顶部偏移（活动泳道恒定在表头之下；其余按是否有内容依次堆叠）
  const activityLaneHeight = model.spanRows * SPAN_ROW_H + 8
  const laneTopByKind = useMemo(() => {
    const map: Partial<Record<PointKind, number>> = {}
    let cursor = HEADER_H + activityLaneHeight
    for (const kind of POINT_KINDS) {
      if (model.points[kind].length === 0) continue
      map[kind] = cursor
      cursor += POINT_ROW_H
    }
    return map
  }, [model, activityLaneHeight])

  const setZoom = (next: number, anchorClientX?: number) => {
    const el = scrollRef.current
    setSelected(null)
    if (!el) return setPpd(next)
    const rect = el.getBoundingClientRect()
    const cx = (anchorClientX ?? rect.left + rect.width / 2) - rect.left + el.scrollLeft - LANE_LABEL_W
    const dayAt = cx / ppd
    setPpd(next)
    requestAnimationFrame(() => {
      el.scrollLeft = dayAt * next - ((anchorClientX ?? rect.left + rect.width / 2) - rect.left - LANE_LABEL_W)
    })
  }
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(clamp(ppd * (e.deltaY < 0 ? 1.12 : 0.89), MIN_PPD, MAX_PPD), e.clientX)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el || isEmpty) return
    el.scrollLeft = Math.max(0, dayX(tOffset) - el.clientWidth / 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmpty])

  /** 卡片水平位置裁剪到当前可视滚动窗口内，避免超出屏幕 */
  const clampAnchorX = (rawX: number): number => {
    const el = scrollRef.current
    if (!el) return rawX
    const viewLeft = el.scrollLeft + LANE_LABEL_W + 4
    const viewRight = el.scrollLeft + el.clientWidth - CARD_W - 4
    return clamp(rawX, viewLeft, Math.max(viewLeft, viewRight))
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">时间轴</h1>
          <p className="text-sm text-muted-foreground">学期鸟瞰 · 点击项目查看详情 · ⌘/Ctrl+滚轮缩放</p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" aria-label="缩小" onClick={() => setZoom(clamp(ppd * 0.8, MIN_PPD, MAX_PPD))}>
              <Minus className="size-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="size-7" aria-label="放大" onClick={() => setZoom(clamp(ppd * 1.25, MIN_PPD, MAX_PPD))}>
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
          <div className="relative" style={{ width: width + LANE_LABEL_W, minWidth: '100%' }} onClick={() => setSelected(null)}>
            {/* 表头：月份 + （放大时）日期刻度 */}
            <div className="sticky top-0 z-20 border-b bg-background" style={{ height: HEADER_H, paddingLeft: LANE_LABEL_W }}>
              {model.months.map((m, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-5 items-center border-l pl-1.5 text-xs font-medium text-muted-foreground"
                  style={{ left: LANE_LABEL_W + dayX(m.startDay), width: dayX(m.days) }}
                >
                  {m.label}
                </div>
              ))}
              {showTicks &&
                ticks.map((t, i) => (
                  <div key={i} className="absolute bottom-0 flex flex-col items-start" style={{ left: LANE_LABEL_W + dayX(t.offset) }}>
                    <span className="pl-0.5 text-[10px] leading-4 text-muted-foreground/70">{t.label}</span>
                  </div>
                ))}
            </div>

            {/* 竖直网格线（放大时，帮助对齐） */}
            {showTicks &&
              ticks.map((t, i) => (
                <div
                  key={`g${i}`}
                  className="pointer-events-none absolute bottom-0 z-0 w-px bg-border/40"
                  style={{ left: LANE_LABEL_W + dayX(t.offset), top: HEADER_H }}
                />
              ))}

            {/* 今日竖线 */}
            {tOffset >= 0 && tOffset <= model.totalDays && (
              <div className="pointer-events-none absolute bottom-0 z-10 w-px bg-primary/70" style={{ left: LANE_LABEL_W + dayX(tOffset), top: HEADER_H - 16 }}>
                <span className="absolute top-0 -translate-x-1/2 rounded bg-primary px-1 text-[9px] leading-tight text-primary-foreground">今天</span>
              </div>
            )}

            {/* 活动泳道 */}
            <Lane label="活动" heightPx={activityLaneHeight}>
              {model.spans.map((s) => {
                const left = Math.max(dayX(dayOffset(s.start, model.rangeStart)), 0)
                const right = s.end ? dayX(dayOffset(s.end, model.rangeStart)) : width
                const barLeft = LANE_LABEL_W + left
                const barWidth = Math.max(right - left, 8)
                const barTop = s.row * SPAN_ROW_H + 4
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected({
                        type: 'span',
                        id: s.id,
                        anchorX: clampAnchorX(barLeft + barWidth + GAP),
                        anchorY: HEADER_H + barTop - GAP,
                      })
                    }}
                    title={s.label}
                    className={cn(
                      'absolute flex h-6 items-center overflow-hidden rounded px-2 text-[11px] text-white ring-offset-2 hover:ring-2 hover:ring-white/60',
                      s.colorClass,
                      !s.end && 'opacity-80',
                      selected?.type === 'span' && selected.id === s.id && 'ring-2 ring-white',
                    )}
                    style={{ left: barLeft, width: barWidth, top: barTop }}
                  >
                    <span className="truncate">{s.label}</span>
                  </button>
                )
              })}
            </Lane>

            {/* 考试 / 截止 / 任务泳道：大圆点，点击在右上角弹卡 */}
            {POINT_KINDS.map((kind) => {
              const pts = model.points[kind]
              if (pts.length === 0) return null
              const style = POINT_STYLE[kind]
              const laneTop = laneTopByKind[kind]!
              return (
                <Lane key={kind} label={style.label} heightPx={POINT_ROW_H}>
                  {pts.map((p) => {
                    const x = dayX(dayOffset(p.date, model.rangeStart))
                    const isSel = selected?.type === 'point' && selected.id === p.id
                    const isLongTerm = kind === 'task' && daysUntil(p.date) > LONG_TERM_DAYS
                    return (
                      <Fragment key={p.id}>
                        {isLongTerm && (
                          <span
                            className="pointer-events-none absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-sky-500/35"
                            style={{ left: LANE_LABEL_W + dayX(tOffset), width: Math.max(x - dayX(tOffset), 0) }}
                          />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const cyLocal = laneTop + POINT_ROW_H / 2
                            setSelected({
                              type: 'point',
                              kind,
                              id: p.id,
                              anchorX: clampAnchorX(LANE_LABEL_W + x + DOT_R + GAP),
                              anchorY: cyLocal - DOT_R - GAP,
                            })
                          }}
                          title={p.label}
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                          style={{ left: LANE_LABEL_W + x }}
                        >
                          <span
                            className={cn(
                              'block rounded-full ring-2 ring-background transition-transform hover:scale-125',
                              style.dot,
                              isSel && 'scale-125 ring-white',
                            )}
                            style={{ width: DOT_R * 2, height: DOT_R * 2 }}
                          />
                        </button>
                      </Fragment>
                    )
                  })}
                </Lane>
              )
            })}

            {/* 详情卡：锚点为项目右上角，卡片从锚点向上向右展开 */}
            {selected && <TimelineCard selected={selected} model={model} onClose={() => setSelected(null)} onNavigate={onNavigate} />}
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
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 rounded-full bg-sky-500/50" />
            长期任务引导线
          </span>
        </div>
      )}
    </div>
  )
}

function TimelineCard({
  selected,
  model,
  onClose,
  onNavigate,
}: {
  selected: Exclude<Selected, null>
  model: ReturnType<typeof buildTimelineModel>
  onClose: () => void
  onNavigate: (v: AppView) => void
}) {
  const activities = usePlanningStore((s) => s.activities)
  const events = usePlanningStore((s) => s.events)
  const tasks = usePlanningStore((s) => s.tasks)

  let title = ''
  let rows: { k: string; v: string }[] = []
  let go: AppView = 'tasks'

  if (selected.type === 'span') {
    const a = activities.find((x) => x.id === selected.id)
    if (!a) return null
    title = a.title
    go = 'activities'
    rows = [
      { k: '类型', v: ACTIVITY_CATEGORY_LABEL[a.category] + ' · ' + ACTIVITY_LEVEL_LABEL[a.level] },
      ...(a.role || a.organization ? [{ k: '角色', v: [a.role, a.organization].filter(Boolean).join(' · ') }] : []),
      { k: '时间', v: `${a.startDate}${a.endDate ? ` ~ ${a.endDate}` : ' 至今'}` },
      ...(a.achievements.length ? [{ k: '成果', v: a.achievements.join('、') }] : []),
    ]
  } else {
    const p = model.points[selected.kind].find((x) => x.id === selected.id)
    if (!p) return null
    title = p.label
    const diff = daysUntil(p.date)
    const due = diff < 0 ? `逾期 ${-diff} 天` : diff === 0 ? '今天' : `${diff} 天后`
    if (selected.kind === 'task') {
      const t = tasks.find((x) => x.id === selected.id)
      const ev = t?.parentEventId ? events.find((e) => e.id === t.parentEventId) : undefined
      rows = [
        { k: '到期', v: `${p.date}（${due}）` },
        { k: '优先级', v: t ? { high: '高', medium: '中', low: '低' }[t.priority] : '' },
        ...(ev ? [{ k: '关联', v: ev.title }] : []),
      ]
    } else {
      rows = [{ k: selected.kind === 'exam' ? '考试' : '截止', v: `${p.date}（${due}）` }]
    }
  }

  return (
    <div
      className="absolute z-40 flex w-60 flex-col gap-1.5 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-border"
      style={{ left: selected.anchorX, top: selected.anchorY, transform: 'translateY(-100%)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <button type="button" aria-label="关闭" className="text-muted-foreground" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1 text-xs">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">{r.k}</span>
            <span className="min-w-0">{r.v}</span>
          </div>
        ))}
      </div>
      <Badge variant="outline" className="mt-1 w-fit cursor-pointer text-[10px]" onClick={() => onNavigate(go)}>
        前往{go === 'activities' ? '活动' : '任务'} →
      </Badge>
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
