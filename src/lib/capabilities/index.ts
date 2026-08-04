import { getCapability, registerCapability } from './registry'
import { CORE_READ_CAPABILITIES } from './core/reads'
import { CORE_PROPOSE_CAPABILITIES } from './core/proposals'
import { APPLICATION_PROPOSE_CAPABILITIES, APPLICATION_READ_CAPABILITIES } from './application'

/**
 * 核心能力的注册入口。**其余代码一律从这里 import，不要直接 import ./registry**——
 * ES 模块保证被 import 的模块先求值，走这个入口就不会读到还没注册完的注册表。
 *
 * S13 的 plugin 在这之后注册自己的能力（`owner: 'plugin:<name>'`），
 * 走的是同一个 registerCapability，没有第二条路径。
 */
for (const cap of [
  ...CORE_READ_CAPABILITIES,
  ...CORE_PROPOSE_CAPABILITIES,
  ...APPLICATION_READ_CAPABILITIES,
  ...APPLICATION_PROPOSE_CAPABILITIES,
]) {
  // 跳过已注册：dev 下 HMR 会重新求值本模块，重名直接抛错会把页面打挂。
  // 真正的 plugin 重名仍然会在 registerCapability 里抛。
  if (!getCapability(cap.name)) registerCapability(cap)
}

export { applyProposal, type ApplyContext } from './core/apply'
export * from './registry'
export * from './types'
