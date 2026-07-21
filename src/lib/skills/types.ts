/** 声明式 skill 定义：纯数据，不含可执行代码——为 S6 开源 skill 市场接受社区贡献做准备 */
export interface SkillDefinition {
  id: string
  name: string
  description: string
  /** 激活后追加到 agent loop system prompt 的人设片段 */
  personaPrompt: string
  /** 激活时允许调用的工具名（AGENT_TOOLS 的子集） */
  allowedTools: string[]
  /** 规则引擎主动建议话术里引用的一句话说明 */
  suggestHint?: string
}
