import { useEffect, useMemo, useRef } from 'react'
import { CalendarClock, CalendarX, GraduationCap, ListTodo } from 'lucide-react'
import { usePlanningStore } from '@/stores/planningStore'
import { daysUntil } from '@/lib/db/planning'
import { cn } from '@/lib/utils'
import type { AppView } from '@/types'
import { buildTimelineModel, datePct, todayPct, type TimelinePoint } from './timeline-model'

const POINT_STYLE: Record<TimelinePoint['kind'], { icon: typeof CalendarClock; color: string; label: string }> = {
  exam: { icon: GraduationCap, color: 'text-rose-600 dark:text-rose-400', label: '考试' },
  deadline: { icon: CalendarX, color: 'text-amber-600 dark:text-amber-400', label: '截止' },
  task: { icon: ListTodo, color: 'text-sky-600 dark:text-sky-400', label: '任务' },
  'activity-point': { icon: CalendarClock, color: 'text-emerald-600 dark:text-emerald-400', label: '活动' },
}

interface TimelineViewProps {
  onNavigate: (view: AppView) => void
}

/** 学期鸟瞰：横向时间轴，活动为跨度条、考试/DDL/任务为里程碑点 */
export function TimelineView({ onNavigate }: TimelineViewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const events = usePlanningStore((s) => s.events)
  const tasks = usePlanningStore((s) => s.tasks)

  const model = useMemo(() => buildTimelineModel(activities, events, tasks), [activities, events, tasks])
  const isEmpty = model.spans.length === 0 && model.points.length === 0
  // 每月最小宽度，保证可读；不足则横向滚动
  const width = Math.max(model.months.length * 160, 640)
  const tPct = todayPct(model)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 打开时把「今天」滚到视口约 1/4 处（长跨度活动会把范围拉宽，默认聚焦当下）
  useEffect(() => {
    const el = scrollRef.current
    if (!el || isEmpty) return
    const target = (tPct / 100) * width - el.clientWidth / 4
    el.scrollLeft = Math.max(0, target)
  }, [tPct, width, isEmpty])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8">
        <header>
          <h1 className="font-heading text-xl font-semibold">时间轴</h1>
          <p className="text-sm text-muted-foreground">学期鸟瞰：活动、考试、DDL 与任务的全局视图</p>
        </header>

        {isEmpty ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            还没有可展示的内容。添加活动、考试或任务后，这里会出现完整时间轴。
          </p>
        ) : (
          <div ref={scrollRef} className="overflow-x-auto rounded-xl border bg-card p-4">
            <div className="relative" style={{ width }}>
              {/* 月份表头 */}
              <div className="flex border-b pb-1">
                {model.months.map((m, i) => (
                  <div
                    key={i}
                    className="shrink-0 border-l pl-2 text-xs font-medium text-muted-foreground first:border-l-0"
                    style={{ width: `${(m.days / model.totalDays) * 100}%` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>

              {/* 今日线 */}
              {tPct >= 0 && tPct <= 100 && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-primary"
                  style={{ left: `${tPct}%` }}
                >
                  <span className="absolute -top-0.5 -translate-x-1/2 rounded bg-primary px-1 text-[9px] leading-tight text-primary-foreground">
                    今天
                  </span>
                </div>
              )}

              {/* 活动跨度条 */}
              <div className="flex flex-col gap-1.5 py-3">
                {model.spans.map((s) => {
                  const left = Math.max(datePct(s.start, model), 0)
                  const rightPct = s.end ? datePct(s.end, model) : 100
                  const w = Math.max(rightPct - left, 1.5)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onNavigate('activities')}
                      className="relative h-6 w-full text-left"
                      title={s.label}
                    >
                      <span
                        className={cn(
                          'absolute flex h-6 items-center overflow-hidden rounded px-2 text-xs text-white',
                          s.colorClass,
                          !s.end && 'opacity-80',
                        )}
                        style={{ left: `${left}%`, width: `${w}%` }}
                      >
                        <span className="truncate">{s.label}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* 里程碑点 */}
              <div className="relative mt-1 h-px bg-border">
                {model.points.map((p) => {
                  const left = datePct(p.date, model)
                  if (left < 0 || left > 100) return null
                  const style = POINT_STYLE[p.kind]
                  const Icon = style.icon
                  const diff = daysUntil(p.date)
                  return (
                    <button
                      key={`${p.kind}-${p.id}`}
                      type="button"
                      onClick={() => onNavigate(p.kind === 'task' ? 'tasks' : 'tasks')}
                      className="group absolute top-0 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${left}%` }}
                      title={`${p.label} · ${diff < 0 ? `逾期${-diff}天` : diff === 0 ? '今天' : `${diff}天后`}`}
                    >
                      <Icon className={cn('size-4', style.color)} />
                      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded bg-popover px-1.5 py-0.5 text-[10px] shadow ring-1 ring-border group-hover:block">
                        {p.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 图例 */}
        {!isEmpty && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {Object.values(POINT_STYLE).map((s) => (
              <span key={s.label} className="flex items-center gap-1">
                <s.icon className={cn('size-3.5', s.color)} />
                {s.label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="h-3 w-4 rounded bg-slate-400" />
              活动跨度（进行中为半透明）
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
