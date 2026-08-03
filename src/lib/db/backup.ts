import { db } from './index'
import { getSettings } from './repositories'
import { getProfile } from './planning'
import { migrateLegacyTables, type MigratedTables } from './migrate-v6'
import type { ExportBundle } from '@/types'

const EXPORT_VERSION = 6

/** 导出全部本地数据为 JSON（剥离 apiKey，避免备份文件泄露密钥） */
export async function exportAll(): Promise<ExportBundle> {
  const [conversations, messages, settings, profile, growthEvents, artifacts, canvasNodes, canvasEdges] =
    await Promise.all([
      db.conversations.toArray(),
      db.messages.toArray(),
      getSettings(),
      getProfile(),
      db.growthEvents.toArray(),
      db.artifacts.toArray(),
      db.canvasNodes.toArray(),
      db.canvasEdges.toArray(),
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
      db.graphNodeMeta,
    ],
    async () => {
      await Promise.all([
        db.conversations.clear(),
        db.messages.clear(),
        db.growthEvents.clear(),
        db.artifacts.clear(),
        db.canvasNodes.clear(),
        db.canvasEdges.clear(),
        // 3D 星图的分层元数据不进导出（S7 随星图一起删），导入时清空避免残留指向已不存在的节点
        db.graphNodeMeta.clear(),
      ])
      await db.conversations.bulkAdd(bundle.conversations)
      await db.messages.bulkAdd(bundle.messages)
      if (bundle.profile) await db.profile.put(bundle.profile)
      if (tables.growthEvents.length) await db.growthEvents.bulkAdd(tables.growthEvents)
      if (tables.artifacts.length) await db.artifacts.bulkAdd(tables.artifacts)
      if (tables.canvasNodes.length) await db.canvasNodes.bulkAdd(tables.canvasNodes)
      if (tables.canvasEdges.length) await db.canvasEdges.bulkAdd(tables.canvasEdges)
      await db.settings.put({
        ...current,
        modelConfig: { ...bundle.settings.modelConfig, apiKey: current.modelConfig.apiKey },
      })
    },
  )
}
