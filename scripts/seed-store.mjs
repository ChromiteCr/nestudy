#!/usr/bin/env node
// 把内置的那批 skill 发到商店里，署名 imbedded。
//
//   RELAY_TOKEN=<imbedded 的会话令牌> node scripts/seed-store.mjs [--base https://nestudy.cn/api] [--dry]
//
// **源就是 src/generated/skills.json**，不另去读 Skills 仓库。理由是这两件事必须是同一份：
// 学生开箱自带的九个，和商店里挂着 imbedded 名字的九个，如果来源不同，迟早会出现
// 「商店里那份比我内置的新」而没人说得清哪个对。
//
// 为什么要入库（内置明明已经能用）：商店那道「别冒充官方」的确定性闸，判的是
// **「这个名字有没有被老师账号发过」**。官方不入库，那道闸就是空的，
// 任何人都能发一个叫 admissions-reader 的东西挂在商店里。
//
// 走的是正常的 POST /v1/skills，和任何人投稿一模一样——包括那次模型审核。
// 不给官方开后门：如果我们自己写的 skill 过不了自己定的判据，那是判据或 skill 的问题，
// 应该看见，而不是绕过去。落到待审的用网页上的「待审」页签放行。
//
// 令牌怎么来：用 imbedded@nestudy.cn 在网页上正常登录一次，
// 从 localStorage 的 nestudy-token 里取（会话 90 天）。

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(projectRoot, 'src/generated/skills.json')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const baseIndex = args.indexOf('--base')
const base = (baseIndex >= 0 ? args[baseIndex + 1] : process.env.RELAY_BASE) ?? 'http://127.0.0.1:8081'

const token = process.env.RELAY_TOKEN
if (!token && !dryRun) {
  console.error('seed-store: 要 RELAY_TOKEN（imbedded 账号的会话令牌）。加 --dry 可以只看要发什么。')
  process.exit(2)
}

const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'))
const files = bundle.files ?? []
if (files.length === 0) {
  console.error('seed-store: skills.json 是空的，先跑 npm run skills:sync。')
  process.exit(1)
}

console.log(
  `seed-store: ${files.length} 个 skill（集合 ${(bundle.source?.collections ?? []).join(' ')}，` +
    `Library ${bundle.source?.libraryVersion}）→ ${base}`,
)

if (dryRun) {
  for (const f of files) console.log('  ', f.path)
  process.exit(0)
}

/**
 * 先看一眼自己已经投了什么。
 *
 * 版本闸只拦「已上架的那份版本更高」，**拦不住已经在待审里的那份**——
 * 于是不查这一下，每次重跑都会把还卡在队列里的重新审一遍，白烧一次模型调用。
 * 队列里那条本来就等着人看，再审一次也不会变。
 */
const alreadyPending = new Map()
try {
  const mine = await fetch(`${base}/v1/skills/mine`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => (r.ok ? r.json() : null))
  for (const row of mine?.items ?? []) {
    if (row.state === 'pending') alreadyPending.set(row.name, row.version)
  }
} catch {
  // 查不到就当没有，大不了多审一次。这一步是省钱不是正确性
}

const versionOf = (text) => (text.match(/^version:\s*(.+)$/m)?.[1] ?? '').trim()
const nameOf = (text) => (text.match(/^name:\s*(.+)$/m)?.[1] ?? '').trim()

let listed = 0
let pending = 0
let current = 0
let skipped = 0
const failures = []

for (const file of files) {
  const name = nameOf(file.text)
  if (name && alreadyPending.get(name) === versionOf(file.text)) {
    skipped++
    console.log(`  ~ 已在队列里等着 ${file.path}`)
    continue
  }

  let response
  try {
    response = await fetch(`${base}/v1/skills`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: file.text }),
    })
  } catch (error) {
    failures.push(`${file.path}：连不上（${error instanceof Error ? error.name : 'error'}）`)
    continue
  }

  const payload = await response.json().catch(() => null)

  if (response.ok) {
    if (payload?.state === 'listed') {
      listed++
      console.log(`  ✓ 上架 ${file.path}`)
    } else {
      pending++
      const concerns = (payload?.review?.verdicts ?? [])
        .filter((v) => v.verdict === 'concern')
        .map((v) => v.criterion)
      console.log(`  · 待审 ${file.path}（${concerns.join('、') || '模型没说清'}）`)
    }
    continue
  }

  // 版本没递增 = 商店里那份已经是最新的。**这不是失败**，
  // 否则每次重跑都会报一串红，真正的失败反而淹在里面
  if (payload?.error?.code === 'skill_version_stale') {
    current++
    console.log(`  = 已是最新 ${file.path}`)
    continue
  }

  failures.push(`${file.path}：${payload?.error?.code ?? response.status} ${payload?.error?.message ?? ''}`)
}

console.log(
  `\nseed-store: 上架 ${listed} · 待审 ${pending} · 已是最新 ${current}` +
    ` · 队列里已有 ${skipped} · 失败 ${failures.length}`,
)
for (const f of failures) console.error('  ✗', f)

if (pending + skipped > 0) {
  console.log('\n待审的去网页「技能 → 商店 → 待审」放行。落到待审不等于它有问题——')
  console.log('模型只把拿不准的推到那里，明确有问题的会当场退回。')
}

process.exit(failures.length > 0 ? 1 : 0)
