import rawSchools from '@/data/school-requirements.json'
import rawTests from '@/data/test-dates.json'
import type { Capability } from '../types'

/**
 * 事实数据类 capability。
 *
 * 判据是"有数据集，避免幻觉"，但**数据集本身也会骗人**——一份带着"数据截至 X 月"
 * 印章的错误日期，比模型当场承认不知道危险得多。所以这里的取舍是：
 *
 * - **结构性事实**（字数上限、字符限额、报名提前量、出分周期、常见截止日）年年稳定，全部录入
 * - **逐年变动的具体日期与逐校要求**默认留空，由使用者从官网抄录后填进 JSON
 *
 * 两个工具的返回一律带 `dataVersion` 与 `disclaimer`，让模型没法把它说成官方口径。
 */

interface EssaySpec {
  id: string
  label: string
  wordLimit?: number
  charLimit?: number
  minWords?: number
  minCharsPerQuestion?: number
  count?: number
  note?: string
}

interface ActivityLimits {
  maxActivities?: number
  position?: number
  organization?: number
  description?: number
  note?: string
}

interface Platform {
  id: string
  name: string
  displayName: string
  region: string
  officialUrl: string
  essays: EssaySpec[]
  activityLimits?: ActivityLimits
  honorLimits?: { maxHonors: number; title: number }
  choiceLimits?: { maxChoices: number; note?: string }
  recommendations?: string
  commonDeadlines?: { track: string; typical: string; note?: string }[]
  testPolicy?: string
  deadlineTimeNote?: string
}

interface SchoolEntry {
  name: string
  aliases?: string[]
  officialUrl?: string
  source?: string
  verifiedAt?: string
  [key: string]: unknown
}

interface SchoolReference {
  version: string
  updatedAt: string
  disclaimer: string
  platforms: Platform[]
  schools: SchoolEntry[]
}

interface ExamEntry {
  id: string
  name: string
  board: string
  officialUrl: string
  annualWindow: string
  registrationLead: string
  scoreRelease: string
  notes: string[]
  dates: Record<string, unknown>[]
}

interface TestReference {
  version: string
  updatedAt: string
  disclaimer: string
  exams: ExamEntry[]
}

export const SCHOOL_REFERENCE = rawSchools as SchoolReference
export const TEST_REFERENCE = rawTests as TestReference

/** 界面上那句「数据截至 X 年 X 月，请以官网为准」 */
export function referenceStamp(): string {
  return `数据截至 ${SCHOOL_REFERENCE.updatedAt}，请以官网为准`
}

export function getPlatform(id: string): Platform | undefined {
  return SCHOOL_REFERENCE.platforms.find((p) => p.id === id)
}

/** Common App 活动栏的字符限额——check_activity_limits 从这里取，改一处两边都对 */
export const COMMON_APP_ACTIVITY_LIMITS = {
  maxActivities: getPlatform('common-app')?.activityLimits?.maxActivities ?? 10,
  position: getPlatform('common-app')?.activityLimits?.position ?? 50,
  organization: getPlatform('common-app')?.activityLimits?.organization ?? 100,
  description: getPlatform('common-app')?.activityLimits?.description ?? 150,
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

// ---- get_school_requirements ----

export const getSchoolRequirementsCapability: Capability = {
  name: 'get_school_requirements',
  kind: 'read',
  label: '查申请要求',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const school = typeof args.school === 'string' ? args.school.trim() : ''
    if (school) return `查「${school}」的申请要求`
    const platform = typeof args.platform === 'string' ? args.platform.trim() : ''
    return platform ? `查 ${platform} 的申请要求` : undefined
  },
  summary: '查申请平台与学校的要求：文书字数、活动字符限额、常见截止日、推荐信数量',
  owner: 'core',
  schema: {
    name: 'get_school_requirements',
    description:
      '查询申请平台（Common App / UC / UCAS）与学校的申请要求：文书字数上限、活动栏字符限额、常见截止日、推荐信数量、标化政策。**这是本地参考数据集，不是实时官网**，返回里带数据版本，回答时必须转述「以官网为准」。查不到某所学校时不要编，如实说没有并给出该平台的官网入口。',
    parameters: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['common-app', 'uc', 'ucas'],
          description: '只要某个平台；省略则返回全部平台',
        },
        school: { type: 'string', description: '学校名（中英文均可），按名称与别名匹配本地已录入的逐校要求' },
      },
      required: [],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const platformId = typeof args.platform === 'string' ? args.platform : undefined
    const school = typeof args.school === 'string' ? args.school.trim().toLowerCase() : ''

    const platforms = platformId
      ? SCHOOL_REFERENCE.platforms.filter((p) => p.id === platformId)
      : SCHOOL_REFERENCE.platforms

    const matched = school
      ? SCHOOL_REFERENCE.schools.filter(
          (s) =>
            s.name.toLowerCase().includes(school) ||
            (s.aliases ?? []).some((a) => a.toLowerCase().includes(school)),
        )
      : []

    return JSON.stringify({
      dataVersion: SCHOOL_REFERENCE.version,
      updatedAt: SCHOOL_REFERENCE.updatedAt,
      disclaimer: SCHOOL_REFERENCE.disclaimer,
      platforms,
      schools: matched,
      schoolLookup: school
        ? matched.length > 0
          ? undefined
          : `本地数据集没有收录「${args.school as string}」的逐校要求。逐校要求（截止日、标化政策、推荐信封数、补充文书题目）每年变动，不要凭印象作答——请学生去该校 admissions 官网核对，或把官网上的信息告诉你之后用 propose_application 记进申请清单。`
        : undefined,
    })
  },
}

// ---- get_test_dates ----

export const getTestDatesCapability: Capability = {
  name: 'get_test_dates',
  kind: 'read',
  label: '查考试安排',
  describeCall: (rawArgs) => {
    const args = parseArgs(rawArgs)
    const exam = typeof args.exam === 'string' ? args.exam.trim() : ''
    return exam ? `查 ${exam.toUpperCase()} 的考试安排` : undefined
  },
  summary: '查标化考试的年度窗口、报名提前量、出分周期与官网入口',
  owner: 'core',
  schema: {
    name: 'get_test_dates',
    description:
      '查询标化考试（SAT / ACT / AP / IB / TOEFL / IELTS）的年度考试窗口、报名提前量、出分周期与官网入口。**本地数据集默认不含具体考试日期**——那是逐年变动的信息，返回 dates 为空时要如实说明并给官网链接，绝对不要编造某月某日。学生自己记过的考试日在 get_events 里。',
    parameters: {
      type: 'object',
      properties: {
        exam: {
          type: 'string',
          enum: ['sat', 'act', 'ap', 'ib', 'toefl', 'ielts'],
          description: '只要某一项考试；省略则返回全部',
        },
      },
      required: [],
    },
  },
  execute: async (rawArgs) => {
    const args = parseArgs(rawArgs)
    const examId = typeof args.exam === 'string' ? args.exam.toLowerCase() : undefined
    const exams = examId ? TEST_REFERENCE.exams.filter((e) => e.id === examId) : TEST_REFERENCE.exams
    const missingDates = exams.filter((e) => e.dates.length === 0).map((e) => e.name)

    return JSON.stringify({
      dataVersion: TEST_REFERENCE.version,
      updatedAt: TEST_REFERENCE.updatedAt,
      disclaimer: TEST_REFERENCE.disclaimer,
      exams,
      datesNote:
        missingDates.length > 0
          ? `${missingDates.join('、')} 的具体考试日期本地没有收录。窗口与报名提前量可以直接用，但具体到某月某日必须让学生去官网查——不要推测。`
          : undefined,
    })
  },
}
