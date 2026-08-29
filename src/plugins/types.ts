import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Capability } from '@/lib/capabilities'

/**
 * 一个插件能往应用里加三样东西：**一格插件栏 + 一个视图**、**若干能力**、
 * 以及（S16b 之后）**若干看板小组件**。三样都是可选的。
 *
 * ## 为什么仍然只走静态 import
 *
 * `registry.ts` 里是一张写死的数组，构建期就能 tree-shake。这一条从 S13 的规划起
 * 就定了，S16 没有推翻它：浏览器里没有可用的第三方代码沙箱，动态 `import()` 拿到的
 * 是**同源权限**，也就是 IndexedDB 里的全部学习数据。
 * **社区扩展的通道是 skill，不是 plugin。**
 *
 * （S16b 的小组件是另一回事：它是模型生成的声明式页面，跑在 null origin 的沙箱里，
 * 读不到库。两者别混为一谈。）
 */
export interface PluginManifest {
  /** 稳定标识。进 `AppView` 的 `plugin:${id}`，也进 capability 的 owner，改了等于换了个插件 */
  id: string
  /** 插件栏 tooltip 与管理页标题 */
  name: string
  /** 一句话说清它是干什么的，管理页上让人判断要不要开 */
  summary: string
  icon: LucideIcon
  /**
   * 它注册的能力。**`owner` 由宿主统一盖成 `plugin:${id}`，插件自己不填**——
   * 让插件自报 owner 的话，一个写错的 owner 就能让 `unregisterOwner` 关不掉它。
   */
  capabilities?: PluginCapability[]
  /** 插件栏点开之后显示什么。没有 view 就是纯能力插件，不占插件栏那一格 */
  view?: ComponentType
}

export type PluginCapability = Omit<Capability, 'owner'>

// 偏好是落库的数据，定义在 `@/types` 里和 Settings 同层；这里只是转出去方便 import
export type { PluginPrefs } from '@/types'
