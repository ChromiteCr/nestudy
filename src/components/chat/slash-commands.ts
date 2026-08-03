import { listSkills } from '@/lib/skills'

/**
 * 斜杠命令。
 *
 * 触发规则：`/` 在开头、或紧跟一个空白字符之后。这样正常文字里的斜杠
 * （日期 2026/08/03、and/or、路径）不会误触发菜单。
 */

export type SlashCommandKind = 'skill' | 'client'

export interface SlashCommand {
  name: string
  label: string
  description: string
  kind: SlashCommandKind
}

/** 不发给模型、由前端直接执行的命令 */
export const CLIENT_COMMANDS: SlashCommand[] = [
  {
    name: 'compact',
    label: '压缩上下文',
    description: '把靠前的对话压成摘要，腾出上下文空间；历史本身不会被删除',
    kind: 'client',
  },
  {
    name: 'new',
    label: '新对话',
    description: '开一个干净的会话',
    kind: 'client',
  },
]

export function listSlashCommands(): SlashCommand[] {
  const skills = listSkills().map<SlashCommand>((s) => ({
    name: s.manifest.name,
    label: s.manifest.displayName,
    description: s.manifest.description,
    kind: 'skill',
  }))
  return [...skills, ...CLIENT_COMMANDS]
}

export interface SlashQuery {
  /** `/` 在输入串里的下标 */
  start: number
  /** `/` 之后、光标之前的已输入部分 */
  term: string
}

/**
 * 判断光标处是否正在敲一个斜杠命令。
 * 返回 null 表示不在命令上下文里（菜单应关闭）。
 */
export function detectSlashQuery(value: string, cursor: number): SlashQuery | null {
  const before = value.slice(0, cursor)
  const slash = before.lastIndexOf('/')
  if (slash === -1) return null
  // 开头，或前一个字符是空白——否则是普通斜杠
  const prev = slash > 0 ? before[slash - 1] : ''
  if (slash > 0 && !/\s/.test(prev)) return null
  const term = before.slice(slash + 1)
  // 命令名里不含空白；一旦敲了空格就当命令已经打完
  if (/\s/.test(term)) return null
  return { start: slash, term }
}

export function filterCommands(commands: SlashCommand[], term: string): SlashCommand[] {
  if (!term) return commands
  const lower = term.toLowerCase()
  return commands.filter(
    (c) => c.name.toLowerCase().includes(lower) || c.label.toLowerCase().includes(lower),
  )
}

/** 把命令填回输入串：替换掉正在敲的那一段，并补一个空格 */
export function applyCommand(value: string, query: SlashQuery, command: SlashCommand): string {
  const after = value.slice(query.start + 1 + query.term.length)
  return `${value.slice(0, query.start)}/${command.name} ${after.replace(/^\s+/, '')}`
}
