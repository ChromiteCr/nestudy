import {
  getProfile,
  isoToday,
  listActivities,
  listTasks,
  listUpcomingEvents,
} from '@/lib/db/planning'
import type { ToolDef } from './provider'

/**
 * S2 工具集。
 * - 读工具（get_*）：自动执行，让模型了解现状
 * - 提案工具（propose_*）：不写库，渲染确认卡，用户确认后由应用写入
 */
export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'get_profile',
    description: '获取学生档案（年级、课程体系、课程列表、目标学校）',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_tasks',
    description: '获取全部未完成任务（含到期日与优先级）',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_events',
    description: '获取未来 90 天内的考试/截止日期/活动',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_activities',
    description: '获取学生的课外活动档案（竞赛/社团/科研/志愿/实习等，含角色、成果、级别）',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'propose_import',
    description:
      '把解析出的考试/DDL/活动和任务作为提案展示给用户确认（不会直接写入）。用户粘贴通知、或要求你安排任务/日程时使用。日期一律用 YYYY-MM-DD。',
    parameters: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          description: '考试/截止日期/活动（时间点事实）',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              type: { type: 'string', enum: ['exam', 'deadline', 'activity'] },
              date: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['title', 'type', 'date'],
          },
        },
        tasks: {
          type: 'array',
          description: '可勾选的行动项',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              dueDate: { type: 'string', description: 'YYYY-MM-DD' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] },
              eventTitle: { type: 'string', description: '关联事件的标题（可选）' },
            },
            required: ['title', 'dueDate', 'priority'],
          },
        },
      },
      required: [],
    },
  },
  {
    name: 'propose_profile_update',
    description:
      '把档案更新（年级/课程体系/课程/目标学校）作为提案展示给用户确认（不会直接写入）。Onboarding 采访或用户提供档案信息时使用。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '学生名字/昵称' },
        grade: { type: 'number', description: '年级（9-12）' },
        curriculum: { type: 'string', enum: ['IB', 'AP', 'ALevel', 'Other'] },
        courses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              level: { type: 'string', description: 'HL/SL/AP/Standard 等' },
              currentGrade: { type: 'string' },
              targetGrade: { type: 'string' },
            },
            required: ['name', 'level'],
          },
        },
        targetSchools: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              major: { type: 'string' },
              round: { type: 'string', enum: ['ED', 'EA', 'RD', 'Other'] },
              deadline: { type: 'string', description: 'YYYY-MM-DD，可省略' },
            },
            required: ['name'],
          },
        },
      },
      required: [],
    },
  },
  {
    name: 'propose_activities',
    description:
      '把课外活动（竞赛/社团/科研/志愿/实习/艺术/体育等）作为提案展示给用户确认（不会直接写入）。用户描述自己参加过的活动、经历、成果时使用。日期用 YYYY-MM-DD，进行中的活动 endDate 省略或留空。',
    parameters: {
      type: 'object',
      properties: {
        activities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '活动名称' },
              category: {
                type: 'string',
                enum: ['academic', 'leadership', 'service', 'athletics', 'arts', 'work', 'research', 'other'],
              },
              role: { type: 'string', description: '担任的角色，如队长、创始人、成员' },
              organization: { type: 'string', description: '所属组织/机构' },
              startDate: { type: 'string', description: 'YYYY-MM-DD' },
              endDate: { type: 'string', description: 'YYYY-MM-DD，进行中则省略' },
              description: { type: 'string', description: '一句话描述做了什么' },
              achievements: { type: 'array', items: { type: 'string' }, description: '成果/奖项列表' },
              level: { type: 'string', enum: ['school', 'regional', 'national', 'international'] },
            },
            required: ['title', 'category'],
          },
        },
      },
      required: ['activities'],
    },
  },
]

const READ_TOOLS = new Set(['get_profile', 'get_tasks', 'get_events', 'get_activities'])

export function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name)
}

export function isProposeTool(name: string): boolean {
  return name === 'propose_import' || name === 'propose_profile_update' || name === 'propose_activities'
}

/** 执行读工具，返回给模型的 JSON 字符串 */
export async function executeReadTool(name: string): Promise<string> {
  switch (name) {
    case 'get_profile': {
      const p = await getProfile()
      return JSON.stringify({ name: p.name, grade: p.grade, curriculum: p.curriculum, courses: p.courses, targetSchools: p.targetSchools })
    }
    case 'get_tasks': {
      const tasks = await listTasks()
      const pending = tasks.filter((t) => t.status === 'pending').slice(0, 50)
      return JSON.stringify({ today: isoToday(), tasks: pending.map((t) => ({ title: t.title, dueDate: t.dueDate, priority: t.priority })) })
    }
    case 'get_events': {
      const events = await listUpcomingEvents(90)
      return JSON.stringify({ today: isoToday(), events: events.map((e) => ({ title: e.title, type: e.type, date: e.date })) })
    }
    case 'get_activities': {
      const activities = await listActivities()
      return JSON.stringify({
        activities: activities.map((a) => ({
          title: a.title,
          category: a.category,
          role: a.role,
          organization: a.organization,
          startDate: a.startDate,
          endDate: a.endDate,
          achievements: a.achievements,
          level: a.level,
        })),
      })
    }
    default:
      return JSON.stringify({ error: `未知工具：${name}` })
  }
}
