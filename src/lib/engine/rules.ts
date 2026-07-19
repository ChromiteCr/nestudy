import { daysUntil, isoToday } from '@/lib/db/planning'
import { isProfileEmpty } from '@/types'
import type { EventItem, StudentProfile, Task } from '@/types'

/**
 * 主动式 Agent v1：本地规则引擎。
 * 打开应用时计算，命中的规则渲染为 Dashboard 顶部提醒卡；
 * 「去处理」带 prompt 跳入对话。规则声明式定义，后续阶段扩充（S4 反思催写等）。
 */

export interface Reminder {
  /** 去重/关闭用（同规则同对象同 key） */
  key: string
  title: string
  body: string
  /** 点「去处理」后预置到对话的引导语 */
  prompt: string
}

const DDL_LOOKAHEAD_DAYS = 7
const OVERLOAD_THRESHOLD = 5
const COMEBACK_DAYS = 3

export function computeReminders(input: {
  profile: StudentProfile | null
  tasks: Task[]
  events: EventItem[]
  lastActiveAt?: number
}): Reminder[] {
  const { profile, tasks, events, lastActiveAt } = input
  const reminders: Reminder[] = []
  const pending = tasks.filter((t) => t.status === 'pending')

  // R1：DDL 临近（≤7 天）但没有任何关联任务
  const urgentEvents = events
    .filter((e) => {
      const d = daysUntil(e.date)
      return d >= 0 && d <= DDL_LOOKAHEAD_DAYS
    })
    .filter((e) => !pending.some((t) => t.parentEventId === e.id))
    .slice(0, 2)
  for (const e of urgentEvents) {
    const days = daysUntil(e.date)
    reminders.push({
      key: `ddl-no-tasks:${e.id}`,
      title: `「${e.title}」${days === 0 ? '就是今天' : `还有 ${days} 天`}`,
      body: '这个日程还没有任何关联任务，要不要拆解一下准备计划？',
      prompt: `「${e.title}」在 ${e.date}（${days === 0 ? '今天' : `还有 ${days} 天`}），还没有安排任何准备任务。帮我拆解成具体的任务并安排到日程里。`,
    })
  }

  // R2：今日任务积压
  const todayPending = pending.filter((t) => t.dueDate <= isoToday())
  if (todayPending.length > OVERLOAD_THRESHOLD) {
    reminders.push({
      key: 'overload',
      title: `今日待办有 ${todayPending.length} 条`,
      body: '任务有点多，要不要让学栖帮你按优先级重排或顺延一部分？',
      prompt: `我今天有 ${todayPending.length} 条待办任务，感觉做不完。帮我看看现有任务（用 get_tasks），按优先级重排，把可以延后的顺延。`,
    })
  }

  // R3：回归提醒（≥3 天未打开）
  if (lastActiveAt) {
    const awayDays = Math.floor((Date.now() - lastActiveAt) / 86400000)
    if (awayDays >= COMEBACK_DAYS) {
      reminders.push({
        key: 'comeback',
        title: `欢迎回来，离开了 ${awayDays} 天`,
        body: '要不要快速过一遍这几天积累的任务和临近的 DDL？',
        prompt: `我有 ${awayDays} 天没打开学栖了。帮我梳理一下当前的任务和近期日程（用 get_tasks 和 get_events），告诉我现在最该做什么。`,
      })
    }
  }

  // R4：档案不完整（部分填写时提示补全；完全空由 Dashboard 建档 CTA 负责）
  if (profile && !isProfileEmpty(profile)) {
    const missing: string[] = []
    if (profile.courses.length === 0) missing.push('在读课程')
    if (profile.targetSchools.length === 0) missing.push('目标学校')
    if (missing.length > 0) {
      reminders.push({
        key: 'profile-incomplete',
        title: '档案还差一点',
        body: `补全${missing.join('和')}后，学栖的规划建议会更有针对性。`,
        prompt: `我的档案还缺${missing.join('和')}，请像采访一样一步步引导我补全，然后用 propose_profile_update 更新。`,
      })
    }
  }

  return reminders
}
