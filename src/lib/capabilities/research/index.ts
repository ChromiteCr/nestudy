import { dedupeFindingsCapability } from './dedupe'
import type { Capability } from '../types'

/**
 * 调研类能力。
 *
 * 现在只有去重一件事，作用在本地检索结果（`search_artifacts`）上。
 * S11 的 `web_search` / `web_fetch` 落在这个目录里，届时去重不需要改动——
 * 它只认 `{title, url, text}` 这个形状，不关心结果从哪来。
 */
export const RESEARCH_READ_CAPABILITIES: Capability[] = [dedupeFindingsCapability]

export * from './dedupe'
