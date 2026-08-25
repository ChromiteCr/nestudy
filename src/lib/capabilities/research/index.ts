import { dedupeFindingsCapability } from './dedupe'
import { webFetchCapability, webSearchCapability } from './web'
import type { Capability } from '../types'

/**
 * 调研类能力：找资料、看资料、把重复的合掉。
 *
 * 三件事是一条链：`web_search` 出一堆条目 → `dedupe_findings` 数清到底有几件
 * 不同的事 → `web_fetch` 打开值得细看的那几条。去重不关心结果从哪来，
 * 它只认 `{title, url, text}` 这个形状，所以本地检索和网页结果走的是同一个入口。
 */
export const RESEARCH_READ_CAPABILITIES: Capability[] = [
  dedupeFindingsCapability,
  webSearchCapability,
  webFetchCapability,
]

export * from './dedupe'
export * from './web'
