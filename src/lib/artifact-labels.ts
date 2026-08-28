import type { ArtifactKind } from '@/types'

/**
 * 给学生看的资产类型名。
 *
 * 与 `lib/capabilities/core/reads.ts` 里那一份**故意不共用**：那份是给模型读的，
 * 用的是「反思记录」「文书草稿」这类更啰嗦但更不容易被误解的说法；
 * 界面上寸土寸金，用短的。两处读者不同，措辞就该不同。
 */
export const ARTIFACT_KIND_LABEL: Record<ArtifactKind, string> = {
  reflection: '反思',
  document: '文档',
  cheatsheet: '速查表',
  plan: '计划',
  review: '复盘',
  essay: '文书',
  code: '代码',
}
