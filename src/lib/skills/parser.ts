import {
  DEFAULT_MAX_ROUNDS,
  MAX_ALLOWED_ROUNDS,
  SKILL_OUTPUTS,
  type LoadedSkill,
  type SkillManifest,
  type SkillOutput,
  type SkillParseResult,
  type SkillPriority,
  type SkillStatus,
} from './types'

/**
 * SKILL.md 解析器。内置 skill 与 S12 从商店安装的 skill 走同一条路径——
 * 商店里的 skill 是**别人写的纯文本**，构建期校验保护不到它，所以校验必须在运行时。
 *
 * frontmatter 语法刻意只支持 `Skills` 仓库 validate.sh 支持的那个子集
 * （扁平标量 + `- ` 列表，无嵌套、无锚点、无多行标量）。两边认同一套语法，
 * 才不会出现"那边校验通过、这边解析失败"。
 */

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/
const STATUSES: SkillStatus[] = ['draft', 'beta', 'stable', 'deprecated']
const PRIORITIES: SkillPriority[] = ['P0', 'P1', 'P2', 'P3']

type FrontmatterValue = string | string[]
type Frontmatter = Record<string, FrontmatterValue>

interface SplitResult {
  data: Frontmatter
  body: string
  errors: string[]
}

/** 与 validate.sh 的 parse_frontmatter 同构：标量、`- ` 列表、`#` 注释、空行 */
export function splitFrontmatter(text: string): SplitResult | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null

  const data: Frontmatter = {}
  const errors: string[] = []
  let key: string | null = null

  for (const raw of lines.slice(1, end)) {
    const trimmedStart = raw.replace(/^\s+/, '')
    if (!raw.trim() || trimmedStart.startsWith('#')) continue

    if (trimmedStart.startsWith('- ')) {
      if (key === null) {
        errors.push(`列表项没有归属的键：${raw.trim()}`)
        continue
      }
      const current = data[key]
      const list = Array.isArray(current) ? current : []
      list.push(trimmedStart.slice(2).trim())
      data[key] = list
      continue
    }

    const colon = raw.indexOf(':')
    if (colon === -1) {
      errors.push(`无法解析的 frontmatter 行：${raw.trim()}`)
      continue
    }
    key = raw.slice(0, colon).trim()
    const value = raw.slice(colon + 1).trim()
    data[key] = value === '' ? [] : value
  }

  return { data, body: lines.slice(end + 1).join('\n').trim(), errors }
}

function asString(value: FrontmatterValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

function asList(value: FrontmatterValue | undefined): string[] {
  if (Array.isArray(value)) return value.filter((s) => s.length > 0)
  // `key: a, b` 这种写法 validate.sh 会当标量收下，这里宽容地按逗号切开
  if (typeof value === 'string' && value) return value.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

interface ParseInput {
  text: string
  origin: LoadedSkill['origin']
  source: string
}

export function parseSkillMarkdown({ text, origin, source }: ParseInput): SkillParseResult {
  const errors: string[] = []
  const warnings: string[] = []

  const split = splitFrontmatter(text)
  if (!split) {
    return { skill: null, errors: [`${source}：缺少 --- 包裹的 frontmatter`], warnings }
  }
  errors.push(...split.errors.map((e) => `${source}：${e}`))
  const { data, body } = split

  const name = asString(data.name)
  if (!name) errors.push(`${source}：frontmatter 缺少 name`)
  else if (!KEBAB.test(name)) errors.push(`${source}：name「${name}」必须是小写 kebab-case`)

  const description = asString(data.description)
  if (!description) errors.push(`${source}：frontmatter 缺少 description`)

  const category = asString(data.category)
  if (!category) errors.push(`${source}：frontmatter 缺少 category`)

  const version = asString(data.version)
  if (!version) errors.push(`${source}：frontmatter 缺少 version`)
  else if (!SEMVER.test(version)) errors.push(`${source}：version「${version}」不是 semver`)

  const rawStatus = asString(data.status)
  if (!rawStatus) errors.push(`${source}：frontmatter 缺少 status`)
  else if (!STATUSES.includes(rawStatus as SkillStatus)) {
    errors.push(`${source}：status「${rawStatus}」不在 ${STATUSES.join(' / ')} 之内`)
  }

  const rawPriority = asString(data.priority)
  if (!rawPriority) errors.push(`${source}：frontmatter 缺少 priority`)
  else if (!PRIORITIES.includes(rawPriority as SkillPriority)) {
    errors.push(`${source}：priority「${rawPriority}」不在 ${PRIORITIES.join(' / ')} 之内`)
  }

  const compatibleAgents = asList(data.compatible_agents)
  if (compatibleAgents.length === 0) errors.push(`${source}：frontmatter 缺少 compatible_agents`)

  if (!body) errors.push(`${source}：正文为空——正文就是激活后注入的人设，不能没有`)

  // ---- StudyNest 扩展键（可选，缺省有安全默认值）----

  const capabilities = asList(data.capabilities)
  const optionalCapabilities = asList(data.optional_capabilities)
  const readOnly = capabilities.length === 0
  if (readOnly && optionalCapabilities.length > 0) {
    warnings.push(`${source}：没声明 capabilities（按只读处理），optional_capabilities 会被忽略`)
  }

  const outputs: SkillOutput[] = []
  for (const value of asList(data.outputs)) {
    if ((SKILL_OUTPUTS as readonly string[]).includes(value)) outputs.push(value as SkillOutput)
    else warnings.push(`${source}：未知的 outputs 取值「${value}」，已忽略`)
  }
  if (outputs.length === 0) outputs.push('chat')

  let maxRounds = DEFAULT_MAX_ROUNDS
  const rawMaxRounds = asString(data.max_rounds)
  if (rawMaxRounds) {
    const parsed = Number(rawMaxRounds)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ALLOWED_ROUNDS) {
      warnings.push(`${source}：max_rounds「${rawMaxRounds}」不是 1-${MAX_ALLOWED_ROUNDS} 的整数，按默认 ${DEFAULT_MAX_ROUNDS} 处理`)
    } else {
      maxRounds = parsed
    }
  }

  const suggestHint = asString(data.suggest_hint)

  if (errors.length > 0) return { skill: null, errors, warnings }

  const manifest: SkillManifest = {
    name,
    displayName: asString(data.display_name) || name,
    description,
    category,
    version,
    status: rawStatus as SkillStatus,
    priority: rawPriority as SkillPriority,
    compatibleAgents,
    capabilities,
    optionalCapabilities,
    readOnly,
    outputs,
    maxRounds,
    suggestHint: suggestHint || undefined,
  }

  return { skill: { manifest, body, origin, source }, errors, warnings }
}
