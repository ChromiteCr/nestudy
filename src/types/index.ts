// ---- 界面 ----

/** 主界面视图。后续阶段追加：timeline/graph(S3)、reflection(S4)、skills(S5) */
export type AppView = 'dashboard' | 'chat' | 'tasks'

// ---- 学生档案 ----

export type Curriculum = 'IB' | 'AP' | 'ALevel' | 'Other'

export interface Course {
  id: string
  name: string
  /** HL/SL(IB)、AP、Standard */
  level: string
  currentGrade: string
  targetGrade: string
}

export interface TargetSchool {
  id: string
  name: string
  major: string
  round: 'ED' | 'EA' | 'RD' | 'Other'
  /** ISO 日期字符串，可为空 */
  deadline: string | null
}

export interface StudentProfile {
  /** 固定为 'app'，profile 表只有这一行 */
  id: string
  grade: number | null
  curriculum: Curriculum | null
  courses: Course[]
  targetSchools: TargetSchool[]
}

export function isProfileEmpty(p: StudentProfile): boolean {
  return p.grade === null && p.curriculum === null && p.courses.length === 0 && p.targetSchools.length === 0
}

// ---- 日程与任务（分表：DDL 是"事实"，任务是"行动"） ----

export type EventType = 'exam' | 'deadline' | 'activity'
export type DataSource = 'manual' | 'import' | 'ai'

export interface EventItem {
  id: string
  title: string
  type: EventType
  /** ISO 日期字符串（yyyy-mm-dd） */
  date: string
  source: DataSource
  createdAt: number
}

export type TaskPriority = 'high' | 'medium' | 'low'
export type TaskStatus = 'pending' | 'completed'

export interface Task {
  id: string
  title: string
  /** ISO 日期字符串（yyyy-mm-dd） */
  dueDate: string
  priority: TaskPriority
  status: TaskStatus
  parentEventId?: string
  source: DataSource
  createdAt: number
}

// ---- 聊天 ----

/** 消息角色。`tool` 为 S5 skill 系统的 function-calling 预留 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: number
  /** AI 提案（导入/档案更新），渲染为确认卡；随消息持久化 */
  proposal?: Proposal
}

// ---- AI 提案（「AI 提案 → 卡片确认 → 入库」模式，AI 不直接写库） ----

export interface ProposedEvent {
  include: boolean
  title: string
  type: EventType
  date: string
}

export interface ProposedTask {
  include: boolean
  title: string
  dueDate: string
  priority: TaskPriority
  /** 按标题关联到（本次提案或已有的）事件 */
  eventTitle?: string
}

export type ProposalStatus = 'pending' | 'confirmed' | 'dismissed'

/** 档案补丁提案（S1d：Onboarding 用） */
export interface ProfilePatchProposal {
  grade?: number
  curriculum?: Curriculum
  courses?: Omit<Course, 'id'>[]
  targetSchools?: (Omit<TargetSchool, 'id' | 'deadline'> & { deadline?: string | null })[]
}

export type Proposal =
  | { kind: 'import'; events: ProposedEvent[]; tasks: ProposedTask[]; status: ProposalStatus; resultNote?: string }
  | { kind: 'profile'; patch: ProfilePatchProposal; status: ProposalStatus; resultNote?: string }

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

// ---- 模型配置 ----

/**
 * 模型通道：
 * - custom：自带 Key，浏览器直连 OpenAI 兼容 API（S1）
 * - free：经北京服务器无状态代理，匿名 UUID 鉴权（S2 预留）
 */
export type ModelTier = 'custom' | 'free'

export interface ModelConfig {
  tier: ModelTier
  baseURL: string
  apiKey: string
  model: string
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  tier: 'custom',
  baseURL: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-chat',
}

// ---- 设置（settings 表单例） ----

export interface Settings {
  /** 固定为 'app'，settings 表只有这一行 */
  id: string
  modelConfig: ModelConfig
}

// ---- 数据导出 ----

export interface ExportBundle {
  version: number
  exportedAt: number
  conversations: Conversation[]
  messages: Message[]
  /** v2 起包含；旧备份导入时按空处理 */
  profile?: StudentProfile
  events?: EventItem[]
  tasks?: Task[]
  settings: Omit<Settings, 'modelConfig'> & {
    /** 导出时剥离 apiKey，避免备份文件泄露密钥 */
    modelConfig: Omit<ModelConfig, 'apiKey'>
  }
}
