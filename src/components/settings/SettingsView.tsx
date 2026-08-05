import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Cpu, Database, Download, GraduationCap, Palette, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mono } from '@/components/ui/mono'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useSkillStore } from '@/stores/skillStore'
import { downloadJson, exportAll, importAll } from '@/lib/db/backup'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { AppearancePanel } from './AppearancePanel'
import { cn } from '@/lib/utils'

export type SettingsCategory = 'model' | 'profile' | 'appearance' | 'data'

const CATEGORIES: { key: SettingsCategory; label: string; icon: typeof Cpu }[] = [
  { key: 'model', label: '模型', icon: Cpu },
  { key: 'profile', label: '档案', icon: GraduationCap },
  { key: 'appearance', label: '外观', icon: Palette },
  { key: 'data', label: '数据', icon: Database },
]

interface SettingsViewProps {
  initialCategory?: SettingsCategory
}

/** 设置是三导航之一的独立视图，不再套 Dialog——对话框里再开对话框是上一版的结构债 */
export function SettingsView({ initialCategory = 'model' }: SettingsViewProps) {
  const [category, setCategory] = useState<SettingsCategory>(initialCategory)

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b px-6">
        <h1 className="text-lg font-semibold">设置</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b p-3 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors',
                category === c.key
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              <c.icon className="size-4" />
              {c.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {category === 'model' && <ModelPanel />}
          {category === 'profile' && <ProfileForm onSaved={() => toast.success('档案已保存')} />}
          {category === 'appearance' && <AppearancePanel />}
          {category === 'data' && <DataPanel />}
        </div>
      </div>
    </main>
  )
}

function ModelPanel() {
  const modelConfig = useSettingsStore((s) => s.modelConfig)
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig)

  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        自带 Key 模式：请求从浏览器直连模型服务商，Key 只存在本机。
      </p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">API Key（DeepSeek）</span>
        <Input
          type="password"
          value={modelConfig.apiKey}
          placeholder="sk-…"
          className="font-mono"
          onChange={(e) => void updateModelConfig({ apiKey: e.target.value })}
        />
        <span className="text-xs text-muted-foreground">
          在 platform.deepseek.com 创建；免费通道后续上线
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">模型</span>
        <Input
          value={modelConfig.model}
          className="font-mono"
          onChange={(e) => void updateModelConfig({ model: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">API Base URL</span>
        <Input
          value={modelConfig.baseURL}
          className="font-mono"
          onChange={(e) => void updateModelConfig({ baseURL: e.target.value })}
        />
        <span className="text-xs text-muted-foreground">兼容任意 OpenAI 格式的服务商</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">上下文窗口（token）</span>
        <Input
          type="number"
          min={4000}
          step={1000}
          value={modelConfig.contextWindow}
          className="font-mono"
          onChange={(e) => void updateModelConfig({ contextWindow: Number(e.target.value) || 0 })}
        />
        <span className="text-xs text-muted-foreground">
          决定对话涨到多长时自动压缩成摘要。换模型时按它的窗口改，填小了会频繁压缩，填大了会撞上模型上限。
        </span>
      </label>
    </div>
  )
}

function DataPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const growthEvents = usePlanningStore((s) => s.growthEvents)
  const artifacts = usePlanningStore((s) => s.artifacts)
  const shortCount = growthEvents.filter((e) => e.kind === 'short').length
  const longCount = growthEvents.length - shortCount

  const handleExport = async () => {
    downloadJson(await exportAll())
    toast.success('备份已导出（不含 API Key）')
  }

  const handleImportFile = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text())
      await importAll(bundle)
      // skillStore 也要重载：备份里带着自建技能，不刷新的话 agent 还看着旧的那批
      await Promise.all([
        useChatStore.getState().init(),
        usePlanningStore.getState().load(),
        useSkillStore.getState().load(),
      ])
      toast.success('备份已导入')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败，请检查文件')
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        所有数据只存于本机浏览器，建议定期导出备份；导入会覆盖现有数据。
      </p>
      <dl className="flex flex-col gap-1 border-y py-3 text-sm">
        <CountRow label="短期事项" value={shortCount} />
        <CountRow label="长期事项" value={longCount} />
        <CountRow label="学习资产" value={artifacts.length} />
      </dl>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleExport()}>
          <Download className="size-3.5" />
          导出 JSON
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
          <Upload className="size-3.5" />
          导入 JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Mono>{value}</Mono>
      </dd>
    </div>
  )
}
