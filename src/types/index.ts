// ---- 界面 ----

/** 主界面视图。后续阶段追加：skills(S5) */
export type AppView = 'dashboard' | 'chat' | 'tasks' | 'activities' | 'timeline' | 'graph' | 'reflection'

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
  name: string
  grade: number | null
  curriculum: Curriculum | null
  courses: Course[]
  targetSchools: TargetSchool[]
  /** 成长星图中心的专业方向；空则从目标校专业派生 */
  majorDirections?: string[]
}

export function isProfileEmpty(p: StudentProfile): boolean {
  return (
    !p.name &&
    p.grade === null &&
    p.curriculum === null &&
    p.courses.length === 0 &&
    p.targetSchools.length === 0
  )
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

// ---- 活动（背景/成长档案；成果网络图的主节点） ----

export type ActivityCategory =
  | 'academic'
  | 'leadership'
  | 'service'
  | 'athletics'
  | 'arts'
  | 'work'
  | 'research'
  | 'other'

export type ActivityLevel = 'school' | 'regional' | 'national' | 'international'

export const ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  academic: '学术',
  leadership: '领导力',
  service: '志愿服务',
  athletics: '体育',
  arts: '艺术',
  work: '实习/工作',
  research: '科研',
  other: '其他',
}

export const ACTIVITY_LEVEL_LABEL: Record<ActivityLevel, string> = {
  school: '校级',
  regional: '地区级',
  national: '国家级',
  international: '国际级',
}

export interface Activity {
  id: string
  title: string
  category: ActivityCategory
  role: string
  organization: string
  /** ISO 日期字符串（yyyy-mm-dd） */
  startDate: string
  /** null = 进行中 */
  endDate: string | null
  description: string
  achievements: string[]
  level: ActivityLevel
  source: DataSource
  createdAt: number
}

// ---- 叙事线（成果网络图的边；跨实体稳定引用节点） ----

/** 节点 id 带类型前缀：activity:<id> / course:<id> / school:<id> / (S4) reflection:<id> */
export type GraphNodeId = string

export interface NarrativeEdge {
  id: string
  sourceNodeId: GraphNodeId
  targetNodeId: GraphNodeId
  /** 为什么连（叙事说明） */
  label: string
  /** 连接强度 1-5，决定星图中线的粗细；缺省按 3 */
  strength?: number
  source: 'ai' | 'manual'
  createdAt: number
}

/** 星图节点的叠加元数据：分层覆盖 + 星图专属注解（不改动底层活动/课程实体） */
export interface GraphNodeMeta {
  nodeId: GraphNodeId
  /** 手动/AI 分层覆盖默认层 */
  shell?: number
  /** 手动固定层，AI 整理时不改动 */
  pinned?: boolean
  /** 星图卡片上展示的一句话注解（手动编辑 / AI 生成） */
  blurb?: string
}

// ---- 反思（S4：AI 采访式反思 + 星图卫星节点） ----

export type ReflectionTrigger = 'activity' | 'freeform' | 'agent'
export type ReflectionAttachmentKind = 'image'

export interface ReflectionQA {
  question: string
  answer: string
}

export interface ReflectionAttachment {
  id: string
  kind: ReflectionAttachmentKind
  /** OPFS 文件引用 */
  ref: string
}

export interface Reflection {
  id: string
  title: string
  trigger: ReflectionTrigger
  /** freeform/agent 触发时可为空 */
  activityId?: string
  qa: ReflectionQA[]
  summary: string
  /** S4 UI 限 1 张图片；结构不限，S5 放开 */
  attachments: ReflectionAttachment[]
  source: DataSource
  createdAt: number
}

/** 反思草稿里 AI 建议的叙事线：source 固定为这条反思本身，只需给出 target */
export interface ReflectionProposedEdge {
  include: boolean
  targetLabel: string
  reason: string
  strength: number
  targetNodeId: string | null
}

// ---- 任务 ----

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
  name?: string
  grade?: number
  curriculum?: Curriculum
  courses?: Omit<Course, 'id'>[]
  targetSchools?: (Omit<TargetSchool, 'id' | 'deadline'> & { deadline?: string | null })[]
}

export interface ProposedActivity {
  include: boolean
  title: string
  category: ActivityCategory
  role: string
  organization: string
  startDate: string
  endDate: string | null
  description: string
  achievements: string[]
  level: ActivityLevel
}

/** 叙事线提案：AI 按节点标题给出连接（含"为什么连"） */
export interface ProposedEdge {
  include: boolean
  sourceLabel: string
  targetLabel: string
  reason: string
  /** 连接强度 1-5 */
  strength: number
  /** 解析节点 id 后填入；解析失败为 null（不可入库） */
  sourceNodeId: string | null
  targetNodeId: string | null
}

export type Proposal =
  | { kind: 'import'; events: ProposedEvent[]; tasks: ProposedTask[]; status: ProposalStatus; resultNote?: string }
  | { kind: 'profile'; patch: ProfilePatchProposal; status: ProposalStatus; resultNote?: string }
  | { kind: 'activities'; activities: ProposedActivity[]; status: ProposalStatus; resultNote?: string }
  | { kind: 'narrative'; edges: ProposedEdge[]; status: ProposalStatus; resultNote?: string }

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
  /** 上次活跃时间戳（主动提醒的回归规则用） */
  lastActiveAt?: number
  /** 已关闭的提醒：ruleKey → 关闭当天(yyyy-mm-dd)，当天内不再显示 */
  dismissedReminders?: Record<string, string>
  /** 已使用过的 skill id（规则引擎"从未用过"类建议判据） */
  usedSkillIds?: string[]
  /** 用户自定义界面主色；null/缺省 = 主题默认 */
  themeColor?: { r: number; g: number; b: number } | null
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
  /** v3 起包含 */
  activities?: Activity[]
  narrativeEdges?: NarrativeEdge[]
  /** v4 起包含 */
  graphNodeMeta?: GraphNodeMeta[]
  /** v5 起包含 */
  reflections?: Reflection[]
  settings: Omit<Settings, 'modelConfig'> & {
    /** 导出时剥离 apiKey，避免备份文件泄露密钥 */
    modelConfig: Omit<ModelConfig, 'apiKey'>
  }
}
