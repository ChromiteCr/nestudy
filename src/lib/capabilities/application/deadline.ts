import {
  BEIJING,
  findTransition,
  formatInZone,
  formatOffset,
  fromWallClock,
  isValidTimeZone,
  normalizeTimeZone,
  wallClockIn,
  zoneAbbreviation,
  zoneOffsetMs,
} from './timezone'
import type { Capability } from '../types'

/**
 * 截止日换算。中国学生踩得最狠的一个坑：
 * 申请截止清一色写 "11:59pm ET"，而 **11 月初正好是 ET 从 EDT 切回 EST 的那几天**——
 * ED/EA 的 11 月 1 日有些年份就落在切换当天。差一小时，北京时间就差一小时，而截止是硬的。
 *
 * 自然语言（"Nov 1, 11:59pm ET"）交给模型解析成结构化参数，算时区是代码的事。
 * 这条分工就是 S9 判据的原话：确定性计算归 tool，理解语言归 LLM。
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^(\d{1,2}):(\d{2})$/

export interface ResolvedDeadline {
  label?: string
  timeZone: string
  /** 截止地当地时间，带时区缩写 */
  local: string
  localAbbr: string
  /** 北京时间 */
  beijing: string
  utc: string
  offset: string
  /** 北京比截止地快几小时——学生真正要记的就是这个数 */
  beijingAheadHours: number
  instant: number
  past: boolean
  daysRemaining: number
  hoursRemaining: number
  countdown: string
  warnings: string[]
}

export interface DeadlineInput {
  label?: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm，24 小时制；省略按 23:59（申请截止的惯例） */
  time?: string
  /** IANA 名或 ET/PT 这类简写；省略按北京时间 */
  timeZone?: string
  now?: number
}

/** 某个时刻落在北京日历的哪一天（归一到 UTC 零点，只用来做天数相减） */
function beijingCalendarDay(instant: number): number {
  const w = wallClockIn(instant, BEIJING)
  return Date.UTC(w.year, w.month - 1, w.day)
}

export function resolveDeadline(input: DeadlineInput): ResolvedDeadline | { error: string } {
  if (!ISO_DATE.test(input.date)) return { error: `date 必须是 YYYY-MM-DD，收到「${input.date}」` }
  const timeMatch = HHMM.exec((input.time ?? '23:59').trim())
  if (!timeMatch) return { error: `time 必须是 HH:mm（24 小时制），收到「${input.time}」` }
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (hour > 23 || minute > 59) return { error: `time 超出范围：「${input.time}」` }

  const timeZone = normalizeTimeZone(input.timeZone ?? BEIJING)
  if (!isValidTimeZone(timeZone)) {
    return { error: `认不出时区「${input.timeZone}」。用 IANA 名（America/New_York）或 ET/PT/CT/MT 这类简写。` }
  }

  const [year, month, day] = input.date.split('-').map(Number)
  const resolved = fromWallClock({ year, month, day, hour, minute }, timeZone)
  const { instant } = resolved
  const now = input.now ?? Date.now()

  const warnings: string[] = []
  if (resolved.nonexistent) {
    warnings.push('这个当地时间在夏令时跳表的那一小时里，本来就不存在；已按跳表后的时刻计算')
  }
  if (resolved.ambiguous) {
    warnings.push('夏令时回拨当天这个当地时间出现了两次，已取较早的那次（还在夏令时）；差一小时')
  }

  // 截止日压在夏令时切换点附近时必须当面说清楚，这正是 11 月初最容易翻车的地方
  const transition = findTransition(instant, timeZone)
  if (transition) {
    const gapMs = transition.instant - instant
    // 切换点可能只差几小时（10/31 与 11/1 就是这种情况），按天说等于没说
    const gap =
      Math.abs(gapMs) < 86_400_000
        ? `${Math.max(1, Math.round(Math.abs(gapMs) / 3_600_000))} 小时`
        : `${Math.round(Math.abs(gapMs) / 86_400_000)} 天`
    // 用截止时刻**实际的**缩写，而不是按分支猜——跳表那一小时会被推到切换之后，
    // 那时候"切换前"的缩写已经不是它了
    const actual = zoneAbbreviation(instant, timeZone)
    const shift = Math.abs(transition.fromOffsetMs - transition.toOffsetMs) / 3_600_000
    const when = formatInZone(transition.instant, timeZone)
    warnings.push(
      gapMs > 0
        ? `注意：${timeZone} 要到截止 ${gap}后（${when}）才从 ${transition.fromAbbr} 切到 ${transition.toAbbr}，本次按 ${actual} 算`
        : `注意：${timeZone} 已在截止 ${gap}前（${when}）从 ${transition.fromAbbr} 切到 ${transition.toAbbr}，本次按 ${actual} 算，北京时间比切换前${transition.toOffsetMs < transition.fromOffsetMs ? '晚' : '早'} ${shift} 小时`,
    )
  }

  const ms = instant - now
  const past = ms < 0
  const hoursRemaining = Math.floor(Math.abs(ms) / 3_600_000)
  /**
   * "还有几天"按**北京日历天**数，不按整 24 小时段。
   *
   * 学生说"还有 73 天"指的是日历上隔了 73 天，不是"还剩 73 个完整昼夜"。
   * 按 24 小时段算，一个下午三点的此刻就会把当天抹掉，界面上同一个截止日
   * 在画板清单里是 73 天、在申请页里是 72 天——两个数字，一件事。
   */
  const days = Math.abs(Math.round((beijingCalendarDay(instant) - beijingCalendarDay(now)) / 86_400_000))
  const countdown = past
    ? days >= 1
      ? `已过 ${days} 天`
      : `已过 ${hoursRemaining} 小时`
    : days >= 2
      ? `还有 ${days} 天`
      : `还有 ${hoursRemaining} 小时`

  const beijingOffset = zoneOffsetMs(instant, BEIJING)
  return {
    label: input.label,
    timeZone,
    local: `${formatInZone(instant, timeZone)} ${zoneAbbreviation(instant, timeZone)}`.trim(),
    localAbbr: zoneAbbreviation(instant, timeZone),
    beijing: formatInZone(instant, BEIJING),
    utc: new Date(instant).toISOString(),
    offset: formatOffset(resolved.offsetMs),
    beijingAheadHours: (beijingOffset - resolved.offsetMs) / 3_600_000,
    instant,
    past,
    daysRemaining: past ? -days : days,
    hoursRemaining: past ? -hoursRemaining : hoursRemaining,
    countdown,
    warnings,
  }
}

function parseArgs(rawArgs: string): Record<string, unknown> {
  if (!rawArgs?.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

interface RawDeadline {
  label?: unknown
  date?: unknown
  time?: unknown
  timeZone?: unknown
}

export const resolveDeadlineCapability: Capability = {
  name: 'resolve_deadline',
  kind: 'read',
  label: '换算截止时间',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const list = Array.isArray(args.deadlines) ? (args.deadlines as RawDeadline[]) : []
    if (list.length === 1) {
      const label = typeof list[0]?.label === 'string' ? list[0].label.trim() : ''
      return label ? `换算「${label}」的截止时间` : '换算截止时间'
    }
    return list.length > 1 ? `换算 ${list.length} 个截止时间` : undefined
  },
  summary: '把当地时间的截止日换算成北京时间并算剩余时间，含夏令时判定',
  owner: 'core',
  schema: {
    name: 'resolve_deadline',
    description:
      '把截止日从当地时间换算成北京时间，并算出还剩多久。**时区和夏令时你算不准，凡是涉及"北京时间几点截止""还有几天"一律调这个工具**。先把 "Nov 1, 11:59pm ET" 这类说法解析成 date/time/timeZone 三个参数再传进来。timeZone 用 IANA 名（America/New_York）或 ET/PT/CT/MT/GMT 这类简写；不写时间默认 23:59。返回里的 warnings 涉及夏令时切换时必须转述给学生。',
    parameters: {
      type: 'object',
      properties: {
        deadlines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '这是哪个截止日，如「Duke ED」' },
              date: { type: 'string', description: 'YYYY-MM-DD（当地日期）' },
              time: { type: 'string', description: 'HH:mm 24 小时制当地时间，省略按 23:59' },
              timeZone: { type: 'string', description: 'IANA 名或 ET/PT 这类简写，省略按北京时间' },
            },
            required: ['date'],
          },
        },
      },
      required: ['deadlines'],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const raw: RawDeadline[] = Array.isArray(args.deadlines) ? (args.deadlines as RawDeadline[]) : []
    const now = Date.now()

    const results = raw.map((d) =>
      resolveDeadline({
        label: typeof d.label === 'string' ? d.label : undefined,
        date: typeof d.date === 'string' ? d.date : '',
        time: typeof d.time === 'string' ? d.time : undefined,
        timeZone: typeof d.timeZone === 'string' ? d.timeZone : undefined,
        now,
      }),
    )

    return JSON.stringify({
      now: formatInZone(now, BEIJING) + ' 北京时间',
      deadlines: results,
      note: '北京时间与截止地的时差随夏令时变化，beijingAheadHours 是这一天的实际时差，不要拿去套别的日期',
    })
  },
}
