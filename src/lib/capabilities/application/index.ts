import { getApplicationsCapability, proposeApplicationCapability } from './applications'
import { convertGradesCapability } from './grades'
import { checkActivityLimitsCapability, countEssayWordsCapability } from './limits'
import { resolveDeadlineCapability } from './deadline'
import { getSchoolRequirementsCapability, getTestDatesCapability } from './reference'
import { searchArtifactsCapability } from './search'
import type { Capability } from '../types'

/**
 * S9 国际申请能力层。
 *
 * 选进来的判据只有一条：**只有 LLM 做不好或做不了的事才配做成 tool。**
 * 三类各占一组，除此之外的（怎么写活动描述、选哪一轮、文书该讲什么故事）
 * 一律是 skill 的事——给个好 prompt 就能做的，不该占一个工具位。
 *
 * - 确定性计算：数字符、数词、算时区、折成绩
 * - 事实数据：考试安排、平台要求（本地数据集，一律带数据版本与"以官网为准"）
 * - 专属状态：申请清单的读写、历史素材的召回
 */

export const APPLICATION_READ_CAPABILITIES: Capability[] = [
  checkActivityLimitsCapability,
  countEssayWordsCapability,
  resolveDeadlineCapability,
  convertGradesCapability,
  getTestDatesCapability,
  getSchoolRequirementsCapability,
  getApplicationsCapability,
  searchArtifactsCapability,
]

export const APPLICATION_PROPOSE_CAPABILITIES: Capability[] = [proposeApplicationCapability]

export { resolveDeadline, type ResolvedDeadline } from './deadline'
export { referenceStamp, COMMON_APP_ACTIVITY_LIMITS } from './reference'
