import { getCapability, listCapabilities, registerCapability, unregisterOwner } from '@/lib/capabilities'
import type { PluginManifest } from './types'
import type { PluginPrefs } from '@/types'

/**
 * 插件注册表。**一张写死的数组，不是运行时装载**——理由在 `types.ts` 顶上。
 *
 * S16a 落地时这里是空的，插件栏因此不画任何一格，管理页如实说「还没有插件」。
 * 这是对的状态，不是没做完：骨架先立住，第一个真插件是 S17 的时间规划。
 */
const PLUGINS: PluginManifest[] = []

// id 重复会让 `plugin:${id}` 这个 owner 指向两个插件，禁用其中一个会把另一个的能力
// 一起撤掉。构建期就能发现的错，就别留到运行期
const seen = new Set<string>()
for (const p of PLUGINS) {
  if (seen.has(p.id)) throw new Error(`plugin id 重复：${p.id}`)
  seen.add(p.id)
}

export function listPlugins(): PluginManifest[] {
  return PLUGINS
}

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGINS.find((p) => p.id === id)
}

export function isPluginEnabled(id: string, prefs: PluginPrefs): boolean {
  return !(prefs.disabled ?? []).includes(id)
}

/**
 * 全部插件，按用户排的顺序。管理页用这个——**顺序得对全部插件成立**，
 * 只给栏上那几个排序的话，一个插件从栏上摘下来再放回去就会跳到末尾。
 */
export function orderedPlugins(prefs: PluginPrefs): PluginManifest[] {
  const order = prefs.order ?? []
  return [...PLUGINS].sort((a, b) => rank(a.id, order) - rank(b.id, order))
}

/**
 * 插件栏上按顺序显示哪几格。
 *
 * 三层过滤：得开着、没被摘下栏、而且**真的有视图**——纯能力插件占一格是没意义的，
 * 点进去是一片空白。
 */
export function barPlugins(prefs: PluginPrefs): PluginManifest[] {
  const offBar = new Set(prefs.offBar ?? [])
  return orderedPlugins(prefs).filter(
    (p) => p.view && isPluginEnabled(p.id, prefs) && !offBar.has(p.id),
  )
}

/** 没排过序的排在排过序的后面，彼此保持注册表原序（`sort` 在 V8 上是稳定的） */
function rank(id: string, order: string[]): number {
  const at = order.indexOf(id)
  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}

/**
 * 把注册表的能力面对齐到当前偏好：该开的注册、该关的按 owner 整体撤销。
 *
 * **幂等**——开屏调一次、每次改偏好再调一次，重复调不会抛重名。
 * 撤销走 `unregisterOwner` 而不是逐个删名字：插件将来加了一个能力却忘了
 * 在别处同步删除清单，按 owner 撤才不会漏。
 */
export function syncPluginCapabilities(prefs: PluginPrefs): void {
  for (const plugin of PLUGINS) {
    const owner = `plugin:${plugin.id}` as const
    const want = isPluginEnabled(plugin.id, prefs)
    const on = listCapabilities().some((c) => c.owner === owner)
    if (want === on && !failures.has(plugin.id)) continue

    if (!want) {
      unregisterOwner(owner)
      failures.delete(plugin.id)
      continue
    }

    try {
      for (const cap of plugin.capabilities ?? []) {
        // 和核心能力（或别的插件）撞名要炸——重名会让白名单判断失去意义。
        // 但 dev 的 HMR 会重新求值本模块，自己撞自己不算错
        if (getCapability(cap.name)?.owner === owner) continue
        registerCapability({ ...cap, owner })
      }
      failures.delete(plugin.id)
    } catch (error) {
      /*
        **一个坏插件不能把别的插件一起拖下水。**

        实测过不兜住的后果：`registerCapability` 抛出来，穿过 `syncPluginCapabilities`
        和 `pluginStore.load()`，变成一条 unhandled rejection——于是 `prefs` 与 `loaded`
        都没写进 store，排在它后面的插件一个都没轮到，而界面上**什么异常都看不出来**，
        插件栏照画、开关照显示。安静地半初始化比当场报错糟得多。

        所以：回滚这个插件已经注册进去的部分（否则它留下半套工具，
        而按 owner 撤销正是为这种时候准备的），记下来，继续下一个。
      */
      unregisterOwner(owner)
      failures.set(plugin.id, error instanceof Error ? error.message : String(error))
      console.error(`插件 ${plugin.id} 的能力没能注册：`, error)
    }
  }
}

/**
 * 注册失败的插件 → 原因。给管理页显示用。
 *
 * 这在正常情况下永远是空的：插件是内置的、静态 import 的，重名属于构建期就该发现的错。
 * 它存在是为了让这种错**看得见**，而不是让它成为一个可以将就的状态。
 */
const failures = new Map<string, string>()

export function pluginFailure(id: string): string | undefined {
  return failures.get(id)
}
