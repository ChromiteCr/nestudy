import { db } from './index'
import { getSettings } from './repositories'
import { getProfile } from './planning'
import type { ExportBundle } from '@/types'

const EXPORT_VERSION = 2

/** 导出全部本地数据为 JSON（剥离 apiKey，避免备份文件泄露密钥） */
export async function exportAll(): Promise<ExportBundle> {
  const [conversations, messages, settings, profile, events, tasks] = await Promise.all([
    db.conversations.toArray(),
    db.messages.toArray(),
    getSettings(),
    getProfile(),
    db.events.toArray(),
    db.tasks.toArray(),
  ])
  const { apiKey: _apiKey, ...safeModelConfig } = settings.modelConfig
  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    conversations,
    messages,
    profile,
    events,
    tasks,
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

/** 从备份 JSON 恢复（覆盖式导入；apiKey 保留本机现有值；v1 备份无 profile/events/tasks 按空处理） */
export async function importAll(bundle: ExportBundle): Promise<void> {
  if (bundle.version < 1 || bundle.version > EXPORT_VERSION) {
    throw new Error(`不支持的备份版本：${bundle.version}`)
  }
  if (!Array.isArray(bundle.conversations) || !Array.isArray(bundle.messages)) {
    throw new Error('备份文件格式不正确')
  }
  const current = await getSettings()
  await db.transaction(
    'rw',
    [db.conversations, db.messages, db.settings, db.profile, db.events, db.tasks],
    async () => {
      await Promise.all([
        db.conversations.clear(),
        db.messages.clear(),
        db.events.clear(),
        db.tasks.clear(),
      ])
      await db.conversations.bulkAdd(bundle.conversations)
      await db.messages.bulkAdd(bundle.messages)
      if (bundle.profile) await db.profile.put(bundle.profile)
      if (bundle.events?.length) await db.events.bulkAdd(bundle.events)
      if (bundle.tasks?.length) await db.tasks.bulkAdd(bundle.tasks)
      await db.settings.put({
        ...current,
        modelConfig: { ...bundle.settings.modelConfig, apiKey: current.modelConfig.apiKey },
      })
    },
  )
}
