import { useSyncExternalStore } from 'react'
import { capabilitiesSnapshot, subscribeCapabilities } from './registry'
import type { Capability } from './types'

/**
 * 订阅能力面。**界面里一律用这个，不要直接调 `listCapabilities()`**——
 * 后者返回的是一次性数组，插件启停之后界面不会跟着变。
 *
 * 刻意不从 `./index` 转出：那个 barrel 被大量非 React 代码 import，
 * 从它转出一个 hook 会把 React 拖进那些模块的依赖图。
 */
export function useCapabilities(): Capability[] {
  return useSyncExternalStore(subscribeCapabilities, capabilitiesSnapshot, capabilitiesSnapshot)
}
