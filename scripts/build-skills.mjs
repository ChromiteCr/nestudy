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
//   node scripts/build-skills.mjs [--from <skills-repo-path>] [--check]
//
// --check：只校验生成物是否与源同步（CI 用），不写文件。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outFile = join(projectRoot, 'src/generated/skills.json')

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const fromIndex = args.indexOf('--from')
const explicit = fromIndex >= 0 ? args[fromIndex + 1] : undefined

/** 依次尝试：显式参数 → 环境变量 → submodule 位置 → 同级 checkout */
function resolveSkillsRepo() {
  const candidates = [
    explicit,
    process.env.STUDYNEST_SKILLS_REPO,
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
    'build-skills: 未找到 Skills 仓库（试过 --from / $STUDYNEST_SKILLS_REPO / vendor/skills / ../Skills），' +
      '保留现有 src/generated/skills.json 不动。',
  )
  process.exit(checkOnly ? 0 : 0)
}

const skillsDir = join(repo, 'skills')
const files = walkSkillFiles(skillsDir, skillsDir).map((path) => ({
  path,
  text: readFileSync(join(skillsDir, path), 'utf8'),
}))

// 刻意不写生成时间戳：不写就意味着源没变时重新生成的结果逐字节相同，
// diff 里只会出现真正的内容变化。
const bundle = {
  source: {
    repo: 'ChromiteCr/Skills',
    commit: readCommit(repo),
    libraryVersion: readLibraryVersion(repo),
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
  console.log(`build-skills: 已同步（${files.length} 个 skill）`)
  process.exit(0)
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, json)
console.log(`build-skills: 写入 ${relative(projectRoot, outFile)}（${files.length} 个 skill，源 ${bundle.source.commit}）`)
