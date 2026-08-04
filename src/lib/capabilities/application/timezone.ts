/**
 * 时区换算。**不引第三方库**——`Intl.DateTimeFormat` 带完整的 IANA 时区数据库，
 * 夏令时规则每年更新随浏览器走，比打包一份 tzdata 更不容易过期。
 *
 * 要解决的是一个具体的坑：申请截止日几乎都写成 "11:59pm ET"，而
 * **11 月初正好是 ET 从 EDT 切回 EST 的那几天**。差一小时看着无所谓，
 * 但北京时间会整整差一小时，而截止是硬的。
 */

const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = FORMATTERS.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    FORMATTERS.set(timeZone, f)
  }
  return f
}

export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/** 某个绝对时刻在某时区的墙上时间 */
export function wallClockIn(instant: number, timeZone: string): WallClock & { second: number } {
  const parts = formatter(timeZone).formatToParts(new Date(instant))
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const hour = pick('hour')
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    // h23 不该给出 24，留个兜底免得某个引擎在午夜返回 24 把日期算飞
    hour: hour === 24 ? 0 : hour,
    minute: pick('minute'),
    second: pick('second'),
  }
}

/** 某个绝对时刻在某时区的 UTC 偏移（毫秒；东为正） */
export function zoneOffsetMs(instant: number, timeZone: string): number {
  const w = wallClockIn(instant, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  // 抹掉毫秒再比：偏移一定是整分钟的倍数
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** 时区缩写（EST / EDT / GMT+8 …）。这是"今天到底是哪套时间"最直白的证据 */
export function zoneAbbreviation(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(instant))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}

export interface ZonedResult {
  /** 解析出的绝对时刻 */
  instant: number
  offsetMs: number
  /**
   * 这个本地时间根本不存在——春季跳表的那一小时。
   * 已按跳表后的时刻校正（跟 Java ZonedDateTime 同一约定）。
   */
  nonexistent: boolean
  /** 这个本地时间出现了两次——秋季回拨的那一小时；取的是较早的那次（还在夏令时） */
  ambiguous: boolean
}

/**
 * 把"某时区的墙上时间"换成绝对时刻。
 *
 * 做法是标准的双候选回读法：先取该墙钟前后各一天的偏移作为两个候选，
 * 分别减出绝对时刻再读回墙钟，能读回原值的才是有效解。
 * 两个都有效 = 时间重复（回拨），一个都没有 = 时间不存在（跳表）。
 * 单次探测 + 修正的写法在跳表那一小时会给出错值，这里不用。
 */
export function fromWallClock(w: WallClock, timeZone: string): ZonedResult {
  const target = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)
  const DAY = 86_400_000
  const offBefore = zoneOffsetMs(target - DAY, timeZone)
  const offAfter = zoneOffsetMs(target + DAY, timeZone)

  const matches = (instant: number) => {
    const back = wallClockIn(instant, timeZone)
    return (
      back.year === w.year &&
      back.month === w.month &&
      back.day === w.day &&
      back.hour === w.hour &&
      back.minute === w.minute
    )
  }

  const candidates = offBefore === offAfter ? [target - offBefore] : [target - offBefore, target - offAfter]
  const valid = candidates.filter(matches)

  if (valid.length === 0) {
    // 跳表：这个本地时间被跳过了。按跳表前的偏移解，结果自然落到跳表后的时刻
    const instant = target - offBefore
    return { instant, offsetMs: zoneOffsetMs(instant, timeZone), nonexistent: true, ambiguous: false }
  }
  const instant = Math.min(...valid)
  return {
    instant,
    offsetMs: zoneOffsetMs(instant, timeZone),
    nonexistent: false,
    ambiguous: valid.length > 1,
  }
}

/** 把偏移毫秒写成 ±HH:MM */
export function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+'
  const total = Math.abs(offsetMs) / 60000
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(Math.round(total % 60)).padStart(2, '0')
  return `${sign}${h}:${m}`
}

/** 把绝对时刻写成某时区的 `YYYY-MM-DD HH:mm` */
export function formatInZone(instant: number, timeZone: string): string {
  const w = wallClockIn(instant, timeZone)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${w.year}-${p(w.month)}-${p(w.day)} ${p(w.hour)}:${p(w.minute)}`
}

export interface Transition {
  /** 切换发生的绝对时刻 */
  instant: number
  /** 切换前后的缩写与偏移 */
  fromAbbr: string
  toAbbr: string
  fromOffsetMs: number
  toOffsetMs: number
}

/**
 * 找出 instant 前后 window 天内的夏令时切换点（没有则返回 null）。
 *
 * 存在的理由只有一个：**截止日就压在切换点附近时要当面说清楚**。
 * 二分到分钟级，够用了——切换都发生在整点。
 */
export function findTransition(instant: number, timeZone: string, windowDays = 21): Transition | null {
  const DAY = 86_400_000
  let lo = instant - windowDays * DAY
  let hi = instant + windowDays * DAY
  const offLo = zoneOffsetMs(lo, timeZone)
  const offHi = zoneOffsetMs(hi, timeZone)
  if (offLo === offHi) return null

  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (zoneOffsetMs(mid, timeZone) === offLo) lo = mid
    else hi = mid
  }
  return {
    instant: hi,
    fromAbbr: zoneAbbreviation(lo, timeZone),
    toAbbr: zoneAbbreviation(hi, timeZone),
    fromOffsetMs: offLo,
    toOffsetMs: offHi,
  }
}

/**
 * 常见时区简写 → IANA。模型手里拿到的多半是 "ET"/"PT" 这种，
 * 但 Intl 只认 IANA 名。认不出来的原样返回，由调用方报错。
 */
const ZONE_ALIASES: Record<string, string> = {
  ET: 'America/New_York',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  EASTERN: 'America/New_York',
  CT: 'America/Chicago',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  CENTRAL: 'America/Chicago',
  MT: 'America/Denver',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  MOUNTAIN: 'America/Denver',
  PT: 'America/Los_Angeles',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  PACIFIC: 'America/Los_Angeles',
  HST: 'Pacific/Honolulu',
  AKST: 'America/Anchorage',
  GMT: 'Europe/London',
  BST: 'Europe/London',
  UK: 'Europe/London',
  UTC: 'UTC',
  CET: 'Europe/Paris',
  CEST: 'Europe/Paris',
  AEST: 'Australia/Sydney',
  AEDT: 'Australia/Sydney',
  SGT: 'Asia/Singapore',
  HKT: 'Asia/Hong_Kong',
  JST: 'Asia/Tokyo',
  CN: 'Asia/Shanghai',
  BEIJING: 'Asia/Shanghai',
}

export const BEIJING = 'Asia/Shanghai'

export function normalizeTimeZone(input: string): string {
  const raw = input.trim()
  if (!raw) return BEIJING
  const alias = ZONE_ALIASES[raw.toUpperCase().replace(/\s+/g, '')]
  return alias ?? raw
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}
