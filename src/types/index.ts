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

// ---- 日程与任务（S6 前的分表模型；现为 GrowthEvent 的兼容投影，S7 删除） ----

export type EventType = 'exam' | 'deadline' | 'activity'
export type DataSource = 'manual' | 'import' | 'ai'

/** @deprecated S6 起由 GrowthEvent 投影而来，仅供旧视图使用 */
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

/** @deprecated S6 起由 GrowthEvent(kind='long') 投影而来，仅供旧视图使用 */
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

// ---- 统一事项 GrowthEvent（S6：任务 / DDL / 考试 / 活动合并为一张表） ----

/** 短期 = 一个时间点上的事（任务、DDL、考试）；长期 = 一段跨度（活动、项目） */
export type EventKind = 'short' | 'long'

/** 短期事项的类别 */
export type ShortEventCategory = 'task' | 'deadline' | 'exam' | 'application' | 'other'

/** 长期事项复用活动类别，两者合并为事项类别全集 */
export type EventCategory = ShortEventCategory | ActivityCategory

export type EventStatus = 'pending' | 'done' | 'ongoing' | 'archived'

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  ...ACTIVITY_CATEGORY_LABEL,
  task: '任务',
  deadline: '截止',
  exam: '考试',
  application: '申请',
}

/**
 * 统一事项。短期与长期共用一张表，用 kind 区分：
 * - 短期：startDate 即截止/发生日，endDate 恒为 null
 * - 长期：startDate 为开始日，endDate 为 null 表示进行中
 */
export interface GrowthEvent {
  id: string
  kind: EventKind
  title: string
  category: EventCategory
  /** ISO 日期字符串（yyyy-mm-dd） */
  startDate: string
  endDate: string | null
  status: EventStatus
  /** 短期专属 */
  priority?: TaskPriority
  /** 短期事项挂靠的长期事项 id */
  parentId?: string
  /** 以下为长期专属 */
  role?: string
  organization?: string
  description?: string
  achievements?: string[]
  level?: ActivityLevel
  source: DataSource
  createdAt: number
}

// ---- 学习资产 Artifact（S6：skill 产物的统一落点，接管原 reflections） ----

export type ArtifactKind = 'reflection' | 'document' | 'cheatsheet' | 'plan' | 'review' | 'essay' | 'code'

export type ArtifactFormat = 'markdown' | 'latex' | 'json' | 'text'

export interface Artifact {
  id: string
  kind: ArtifactKind
  title: string
  format: ArtifactFormat
  content: string
  /** 反思保留结构化问答，不压成纯文本 */
  qa?: ReflectionQA[]
  /** 产出它的 skill 名（S8 起写入） */
  skillName?: string
  runId?: string
  /** 关联的画板节点 id */
  linkedNodeIds: string[]
  attachments: ReflectionAttachment[]
  /** 为文书素材检索预留 */
  tags: string[]
  createdAt: number
}

// ---- 画板（S6：替代 3D 星图的 graphNodeMeta / narrativeEdges） ----

export interface CanvasNode {
  /** 与 GraphNodeId 同一命名空间：event:<id> / course:<id> / school:<id> / reflection:<id> */
  id: GraphNodeId
  x: number
  y: number
  w?: number
  h?: number
  color?: string
  /** 节点卡片上的一句话注解 */
  blurb?: string
}

export interface CanvasEdge {
  id: string
  sourceNodeId: GraphNodeId
  targetNodeId: GraphNodeId
  /** 为什么连（叙事说明） */
  label: string
  /** 连接强度 1-5，决定线的粗细；缺省按 3 */
  strength?: number
  /** 绑定的反思/文档 artifact；绑定关系可后补、可解绑 */
  artifactId?: string
  source: 'ai' | 'manual'
  createdAt: number
}

// ---- 叙事线（成果网络图的边；跨实体稳定引用节点） ----

/** 节点 id 带类型前缀：event:<id> / course:<id> / school:<id> / reflection:<id>（S6 前活动节点为 activity:<id>） */
export type GraphNodeId = string

/** @deprecated S6 起由 CanvasEdge 投影而来，仅供旧视图使用 */
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

/**
 * 星图节点的叠加元数据。
 * @deprecated S6 起 blurb 落在 CanvasNode 上，shell/pinned 随 3D 星图一起在 S7 移除
 */
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

/** @deprecated S6 起由 Artifact(kind='reflection') 投影而来，仅供旧视图使用 */
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

/** @deprecated S6 起由 GrowthEvent(kind='short', category='task') 投影而来，仅供旧视图使用 */
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
  /** v2–v5 的分表字段。v6 起不再导出，但导入时仍需读取并迁移 */
  events?: EventItem[]
  tasks?: Task[]
  /** v3 起包含 */
  activities?: Activity[]
  narrativeEdges?: NarrativeEdge[]
  /** v4 起包含 */
  graphNodeMeta?: GraphNodeMeta[]
  /** v5 起包含 */
  reflections?: Reflection[]
  /** v6 起包含：统一后的事项 / 资产 / 画板 */
  growthEvents?: GrowthEvent[]
  artifacts?: Artifact[]
  canvasNodes?: CanvasNode[]
  canvasEdges?: CanvasEdge[]
  settings: Omit<Settings, 'modelConfig'> & {
    /** 导出时剥离 apiKey，避免备份文件泄露密钥 */
    modelConfig: Omit<ModelConfig, 'apiKey'>
  }
}
