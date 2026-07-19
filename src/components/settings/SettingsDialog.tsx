import { useRef } from 'react'
import { toast } from 'sonner'
import { Cpu, Database, Download, GraduationCap, Palette, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
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

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: SettingsCategory
  onCategoryChange: (category: SettingsCategory) => void
}

/** 设置中心：仿主界面的侧栏分类布局；窄屏时分类横排 */
export function SettingsDialog({ open, onOpenChange, category, onCategoryChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">学栖设置中心</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* 分类侧栏（窄屏横排） */}
          <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b bg-sidebar p-2 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onCategoryChange(c.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium',
                  category === c.key
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50',
                )}
              >
                <c.icon className="size-4" />
                {c.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {category === 'model' && <ModelPanel />}
            {category === 'profile' && (
              <ProfileForm onSaved={() => toast.success('档案已保存')} />
            )}
            {category === 'appearance' && <AppearancePanel />}
            {category === 'data' && <DataPanel onImported={() => onOpenChange(false)} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
          onChange={(e) => void updateModelConfig({ apiKey: e.target.value })}
        />
        <span className="text-xs text-muted-foreground">
          在 platform.deepseek.com 创建；免费通道后续上线
        </span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">模型</span>
        <Input value={modelConfig.model} onChange={(e) => void updateModelConfig({ model: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">API Base URL</span>
        <Input value={modelConfig.baseURL} onChange={(e) => void updateModelConfig({ baseURL: e.target.value })} />
        <span className="text-xs text-muted-foreground">兼容任意 OpenAI 格式的服务商</span>
      </label>
    </div>
  )
}

function DataPanel({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    downloadJson(await exportAll())
    toast.success('备份已导出（不含 API Key）')
  }

  const handleImportFile = async (file: File) => {
    try {
      const bundle = JSON.parse(await file.text())
      await importAll(bundle)
      await useChatStore.getState().init()
      toast.success('备份已导入')
      onImported()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败，请检查文件')
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        所有数据只存于本机浏览器，建议定期导出备份；导入会覆盖现有数据。
      </p>
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
