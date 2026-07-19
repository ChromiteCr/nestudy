import { useRef } from 'react'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { downloadJson, exportAll, importAll } from '@/lib/db/backup'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const modelConfig = useSettingsStore((s) => s.modelConfig)
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig)
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
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败，请检查文件')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            自带 Key 模式：请求从浏览器直连模型服务商，Key 只存在本机。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">API Key（DeepSeek）</span>
            <Input
              type="password"
              value={modelConfig.apiKey}
              placeholder="sk-…"
              onChange={(e) => void updateModelConfig({ apiKey: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">
              在 platform.deepseek.com 创建；免费通道将在 S2 上线
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">模型</span>
            <Input
              value={modelConfig.model}
              onChange={(e) => void updateModelConfig({ model: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">API Base URL</span>
            <Input
              value={modelConfig.baseURL}
              onChange={(e) => void updateModelConfig({ baseURL: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">兼容任意 OpenAI 格式的服务商</span>
          </label>

          <Separator />

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">数据备份</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleExport()}>
                <Download className="size-3.5" />
                导出 JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => fileInputRef.current?.click()}
              >
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
            <span className="text-xs text-muted-foreground">
              所有数据只存于本机浏览器，建议定期导出备份；导入会覆盖现有数据
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
