import { daysUntil, isoToday } from '@/lib/db/dates'
import { getSkill } from '@/lib/skills'
import { isProfileEmpty } from '@/types'
import type { Artifact, GrowthEvent, StudentProfile } from '@/types'

/**
 * 主动式 Agent v1：本地规则引擎。
 * 打开应用时计算，命中的规则渲染为聊天顶部的提醒条；
 * 「去处理」带 prompt 进入对话。规则声明式定义，后续阶段扩充。
 */

export interface Reminder {
  /** 去重/关闭用（同规则同对象同 key） */
  key: string
  title: string
  body: string
  /** 点「去处理」后预置到对话的引导语；与 suggestSkillName 二选一 */
  prompt?: string
  /** 点「去处理」后激活该 skill 并带 prompt 跳转对话 */
  suggestSkillName?: string
}

const DDL_LOOKAHEAD_DAYS = 7
const OVERLOAD_THRESHOLD = 5
const COMEBACK_DAYS = 3
const REFLECTION_LOOKBACK_DAYS = 7
const ADMISSIONS_READER_MIN_EVENTS = 3

const isTask = (e: GrowthEvent) => e.kind === 'short' && e.category === 'task'
const isSchedule = (e: GrowthEvent) => e.kind === 'short' && e.category !== 'task'

export function computeReminders(input: {
  profile: StudentProfile | null
  growthEvents: GrowthEvent[]
  artifacts: Artifact[]
  usedSkillNames?: string[]
  lastActiveAt?: number
}): Reminder[] {
  const { profile, growthEvents, artifacts, usedSkillNames = [], lastActiveAt } = input
  const reminders: Reminder[] = []
  const pendingTasks = growthEvents.filter((e) => isTask(e) && e.status === 'pending')
  const longEvents = growthEvents.filter((e) => e.kind === 'long')

  // R1：DDL 临近（≤7 天）但没有任何关联任务
  const urgent = growthEvents
    .filter((e) => isSchedule(e) && e.status === 'pending')
    .filter((e) => {
      const d = daysUntil(e.startDate)
      return d >= 0 && d <= DDL_LOOKAHEAD_DAYS
    })
    .filter((e) => !pendingTasks.some((t) => t.parentId === e.id))
    .slice(0, 2)
  for (const e of urgent) {
    const days = daysUntil(e.startDate)
    reminders.push({
      key: `ddl-no-tasks:${e.id}`,
      title: `「${e.title}」${days === 0 ? '就是今天' : `还有 ${days} 天`}`,
      body: '这个日程还没有任何关联任务，要不要拆解一下准备计划？',
      prompt: `「${e.title}」在 ${e.startDate}（${days === 0 ? '今天' : `还有 ${days} 天`}），还没有安排任何准备任务。帮我拆解成具体的任务并安排到日程里。`,
    })
  }

  // R2：今日任务积压
  const todayPending = pendingTasks.filter((t) => t.startDate <= isoToday())
  if (todayPending.length > OVERLOAD_THRESHOLD) {
    reminders.push({
      key: 'overload',
      title: `今日待办有 ${todayPending.length} 条`,
      body: '任务有点多，要不要让学栖帮你按优先级重排或顺延一部分？',
      prompt: `我今天有 ${todayPending.length} 条待办任务，感觉做不完。帮我看看现有事项（用 get_events），按优先级重排，把可以延后的顺延。`,
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
        prompt: `我有 ${awayDays} 天没打开学栖了。帮我梳理一下当前的事项（用 get_events），告诉我现在最该做什么。`,
      })
    }
  }

  // R4：档案不完整（完全空的情况由聊天空态的建档 CTA 负责）
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

  // R5：长期事项结束 ≥7 天且没有关联反思，提醒补写
  const reflectedNodeIds = new Set(
    artifacts.filter((a) => a.kind === 'reflection').flatMap((a) => a.linkedNodeIds),
  )
  const needsReflection = longEvents
    .filter(
      (e) =>
        e.endDate &&
        daysUntil(e.endDate) <= -REFLECTION_LOOKBACK_DAYS &&
        !reflectedNodeIds.has(`event:${e.id}`),
    )
    .slice(0, 1)
  for (const e of needsReflection) {
    reminders.push({
      key: `reflect:${e.id}`,
      title: `要不要反思一下「${e.title}」？`,
      body: '这件事已经结束一段时间了，趁记忆还新鲜，写一条反思记录下来。',
      prompt: `带我反思一下「${e.title}」，一次问我一个问题，问完再用 propose_artifact 把反思存下来。`,
    })
  }

  // R6：长期事项达标但从未用过「招生官读档」
  const admissionsReader = getSkill('admissions-reader')
  if (
    admissionsReader &&
    longEvents.length >= ADMISSIONS_READER_MIN_EVENTS &&
    !usedSkillNames.includes(admissionsReader.manifest.name)
  ) {
    reminders.push({
      key: `suggest-skill:${admissionsReader.manifest.name}`,
      title: `试试「${admissionsReader.manifest.displayName}」`,
      body: admissionsReader.manifest.suggestHint ?? admissionsReader.manifest.description,
      suggestSkillName: admissionsReader.manifest.name,
    })
  }

  return reminders
}
