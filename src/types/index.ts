// ---- 界面 ----

/** 主界面视图。后续阶段追加：tasks(S2)、timeline/graph(S3)、reflection(S4)、skills(S5) */
export type AppView = 'dashboard' | 'chat'

// ---- 聊天 ----

/** 消息角色。`tool` 为 S5 skill 系统的 function-calling 预留 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: number
}

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
  settings: Omit<Settings, 'modelConfig'> & {
    /** 导出时剥离 apiKey，避免备份文件泄露密钥 */
    modelConfig: Omit<ModelConfig, 'apiKey'>
  }
}
