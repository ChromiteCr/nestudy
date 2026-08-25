#!/usr/bin/env node
// 采集 Skills 仓库里的 SKILL.md，生成 src/generated/skills.json。
//
// 这个脚本**只搬字节，不解析**：解析与校验统一交给 src/lib/skills/parser.ts，
// 那份代码同时服务内置 skill 和 S12 从商店安装的 skill。两边共用一个解析器，
// 就不会出现"构建期通过、运行时报错"这类只在其中一侧存在的偏差。
//
// 生成物是**提交进仓库**的。理由是构建独立性：GitHub Actions 只 checkout 本仓库，
// 不该为了打包再去拉第二个仓库（submodule 要多一步 init，构建期 clone 要联网且拖慢 CI）。
// skill 变动的频率远低于代码，换成显式的一步 `npm run skills:sync` 更划算。
// 若日后确实想把 Skills 挂成 submodule，放到 vendor/skills 即可，本脚本会自动认。
//
//   node scripts/build-skills.mjs [--from <skills-repo-path>] [--collections a,b] [--check]
//
// --check：只校验生成物是否与源同步（CI 用），不写文件。
//
// **只采集白名单里的集合。** Skills 仓库是一个独立的个人库，里面还有作词、编程工作流、
// 写作规则、数学建模——那些对一个国际部申请学生毫无用处，而 skill 的名字与说明是**常驻
// system prompt** 的，全收等于每一轮对话都替他背一遍别人的工具箱。学生仍然可以从商店
// 里装任何东西，这里限的只是「开箱自带什么」。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(projectRoot, 'src/generated/skills.json')

/** 开箱自带哪些集合。改这里要连带想清楚 system prompt 会长多少 */
const DEFAULT_COLLECTIONS = ['study-planning', 'skill-authoring']

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const fromIndex = args.indexOf('--from')
const explicit = fromIndex >= 0 ? args[fromIndex + 1] : undefined
const collectionsIndex = args.indexOf('--collections')
const collections = (
  collectionsIndex >= 0
    ? (args[collectionsIndex + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_COLLECTIONS
).sort()

/** 依次尝试：显式参数 → 环境变量 → submodule 位置 → 同级 checkout */
function resolveSkillsRepo() {
  const candidates = [
    explicit,
    process.env.NESTUDY_SKILLS_REPO,
    join(projectRoot, 'vendor/skills'),
    resolve(projectRoot, '../Skills'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (existsSync(join(path, 'skills'))) return path
  }
  return null
}

function walkSkillFiles(dir, base, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkSkillFiles(full, base, found)
    else if (entry.name === 'SKILL.md') found.push(relative(base, full).split(sep).join('/'))
  }
  return found
}

function readCommit(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function readLibraryVersion(repo) {
  try {
    return JSON.parse(readFileSync(join(repo, '.claude-plugin/plugin.json'), 'utf8')).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

const repo = resolveSkillsRepo()
if (!repo) {
  // 拿不到源仓库不是错误：clone 本仓库的人不一定有 Skills。已生成的 JSON 继续用。
  console.warn(
    'build-skills: 未找到 Skills 仓库（试过 --from / $NESTUDY_SKILLS_REPO / vendor/skills / ../Skills），' +
      '保留现有 src/generated/skills.json 不动。',
  )
  process.exit(checkOnly ? 0 : 0)
}

const skillsDir = join(repo, 'skills')
const allPaths = walkSkillFiles(skillsDir, skillsDir)
const files = allPaths
  .filter((path) => collections.includes(path.split('/')[0]))
  .map((path) => ({
    path,
    text: readFileSync(join(skillsDir, path), 'utf8'),
  }))

// 白名单里写了一个仓库里没有的集合，多半是拼错了。静默少收几个 skill 比报错难查得多
const present = new Set(allPaths.map((path) => path.split('/')[0]))
for (const name of collections) {
  if (!present.has(name)) console.warn(`build-skills: 集合「${name}」在源仓库里不存在，跳过。`)
}

// 刻意不写生成时间戳：不写就意味着源没变时重新生成的结果逐字节相同，
// diff 里只会出现真正的内容变化。
const bundle = {
  source: {
    repo: 'ChromiteCr/Skills',
    commit: readCommit(repo),
    libraryVersion: readLibraryVersion(repo),
    // 记下这次收了哪些集合。不记的话，用不同参数跑出来的产物差异在 diff 里
    // 看起来就是「凭空少了十个 skill」，而没有任何线索说明为什么
    collections,
  },
  files,
}
const json = `${JSON.stringify(bundle, null, 2)}\n`

if (checkOnly) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : ''
  if (current !== json) {
    console.error('build-skills: src/generated/skills.json 与 Skills 仓库不同步，请运行 npm run skills:sync')
    process.exit(1)
  }
  console.log(`build-skills: 已同步（${files.length} 个 skill，集合 ${collections.join(' ')}）`)
  process.exit(0)
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, json)
console.log(
  `build-skills: 写入 ${relative(projectRoot, outFile)}` +
    `（${files.length}/${allPaths.length} 个 skill，集合 ${collections.join(' ')}，源 ${bundle.source.commit}）`,
)
