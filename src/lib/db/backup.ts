import { db } from './index'
import { getSettings } from './repositories'
import { getProfile } from './profile'
import { migrateLegacyTables, type MigratedTables } from './migrate-v6'
import type { ExportBundle } from '@/types'

const EXPORT_VERSION = 9

/** 导出全部本地数据为 JSON（剥离 apiKey，避免备份文件泄露密钥） */
export async function exportAll(): Promise<ExportBundle> {
  const [
    conversations,
    messages,
    settings,
    profile,
    growthEvents,
    artifacts,
    canvasNodes,
    canvasEdges,
    skillRuns,
    applications,
    userSkills,
  ] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    getSettings(),
    getProfile(),
    db.growthEvents.toArray(),
    db.artifacts.toArray(),
    db.canvasNodes.toArray(),
    db.canvasEdges.toArray(),
    db.skillRuns.toArray(),
    db.applications.toArray(),
    db.userSkills.toArray(),
  ])
  const { apiKey: _apiKey, ...safeModelConfig } = settings.modelConfig
  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    conversations,
    messages,
    profile,
    growthEvents,
    artifacts,
    canvasNodes,
    canvasEdges,
    skillRuns,
    applications,
    userSkills,
    settings: { ...settings, modelConfig: safeModelConfig },
  }
}

export function downloadJson(bundle: ExportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const date = new Date(bundle.exportedAt).toISOString().slice(0, 10)
  a.href = url
  a.download = `studynest-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** v6 之前的备份走与 Dexie v6 升级同一套映射，保证两条路径行为一致 */
function resolveTables(bundle: ExportBundle): MigratedTables {
  if (bundle.version >= 6) {
    return {
      growthEvents: bundle.growthEvents ?? [],
      artifacts: bundle.artifacts ?? [],
      canvasNodes: bundle.canvasNodes ?? [],
      canvasEdges: bundle.canvasEdges ?? [],
    }
  }
  return migrateLegacyTables({
    events: bundle.events,
    tasks: bundle.tasks,
    activities: bundle.activities,
    narrativeEdges: bundle.narrativeEdges,
    graphNodeMeta: bundle.graphNodeMeta,
    reflections: bundle.reflections,
  })
}

/** 从备份 JSON 恢复（覆盖式导入；apiKey 保留本机现有值；v1 备份无 profile/事项按空处理） */
export async function importAll(bundle: ExportBundle): Promise<void> {
  if (bundle.version < 1 || bundle.version > EXPORT_VERSION) {
    throw new Error(`不支持的备份版本：${bundle.version}`)
  }
  if (!Array.isArray(bundle.conversations) || !Array.isArray(bundle.messages)) {
    throw new Error('备份文件格式不正确')
  }
  const tables = resolveTables(bundle)
  const current = await getSettings()
  await db.transaction(
    'rw',
    [
      db.conversations,
      db.messages,
      db.settings,
      db.profile,
      db.growthEvents,
      db.artifacts,
      db.canvasNodes,
      db.canvasEdges,
      db.skillRuns,
      db.applications,
      db.userSkills,
    ],
    async () => {
      await Promise.all([
        db.conversations.clear(),
        db.messages.clear(),
        db.growthEvents.clear(),
        db.artifacts.clear(),
        db.canvasNodes.clear(),
        db.canvasEdges.clear(),
        db.skillRuns.clear(),
        db.applications.clear(),
        db.userSkills.clear(),
      ])
      await db.conversations.bulkAdd(bundle.conversations)
      await db.messages.bulkAdd(bundle.messages)
      if (bundle.profile) await db.profile.put(bundle.profile)
      if (tables.growthEvents.length) await db.growthEvents.bulkAdd(tables.growthEvents)
      if (tables.artifacts.length) await db.artifacts.bulkAdd(tables.artifacts)
      if (tables.canvasNodes.length) await db.canvasNodes.bulkAdd(tables.canvasNodes)
      if (tables.canvasEdges.length) await db.canvasEdges.bulkAdd(tables.canvasEdges)
      if (bundle.applications?.length) await db.applications.bulkAdd(bundle.applications)
      if (bundle.userSkills?.length) await db.userSkills.bulkAdd(bundle.userSkills)
      if (bundle.skillRuns?.length) await db.skillRuns.bulkAdd(bundle.skillRuns)
      // v6 备份里没有 skillRuns：把旧的 usedSkillIds 补成运行记录，与 Dexie v7 升级同一口径
      else if (bundle.settings.usedSkillIds?.length) {
        const now = Date.now()
        await db.skillRuns.bulkAdd(
          bundle.settings.usedSkillIds.map((skillName) => ({
            id: crypto.randomUUID(),
            skillName,
            conversationId: '',
            startedAt: now,
            finishedAt: now,
            rounds: 0,
            proposals: 0,
            status: 'done' as const,
          })),
        )
      }
      await db.settings.put({
        ...current,
        modelConfig: { ...bundle.settings.modelConfig, apiKey: current.modelConfig.apiKey },
      })
    },
  )
}
