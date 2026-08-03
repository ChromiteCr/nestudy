import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settingsStore'
import type { ThemeColor } from '@/lib/theme'

const DEFAULT_PICK: ThemeColor = { r: 99, g: 102, b: 241 }

const CHANNELS: { key: keyof ThemeColor; label: string; trackClass: string }[] = [
  { key: 'r', label: 'R', trackClass: 'accent-red-500' },
  { key: 'g', label: 'G', trackClass: 'accent-green-500' },
  { key: 'b', label: 'B', trackClass: 'accent-blue-500' },
]

/** 画板签名色：RGB 三通道拖动条 + 实时预览。界面本身是无彩的，颜色留给学生的数据 */
export function AppearancePanel() {
  const themeColor = useSettingsStore((s) => s.themeColor)
  const updateThemeColor = useSettingsStore((s) => s.updateThemeColor)
  const color = themeColor ?? DEFAULT_PICK
  const rgb = `rgb(${color.r}, ${color.g}, ${color.b})`

  return (
    <div className="flex max-w-md flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        拖动 RGB 滑条选择你的画板签名色（画板节点强调与焦点态），实时生效并保存在本机。界面其余部分保持无彩，让画板上的内容成为唯一有颜色的东西。
      </p>

      <div className="flex items-center gap-3">
        <div className="size-12 shrink-0 rounded-lg border shadow-xs" style={{ background: rgb }} />
        <div className="flex flex-col">
          <span className="font-mono text-sm">{rgb}</span>
          <span className="text-xs text-muted-foreground">
            {themeColor ? '自定义签名色' : '当前为默认签名色（未启用自定义）'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {CHANNELS.map((ch) => (
          <label key={ch.key} className="flex items-center gap-3 text-sm">
            <span className="w-4 font-mono font-medium">{ch.label}</span>
            <input
              type="range"
              min={0}
              max={255}
              value={color[ch.key]}
              className={`flex-1 ${ch.trackClass}`}
              onChange={(e) => void updateThemeColor({ ...color, [ch.key]: Number(e.target.value) })}
            />
            <span className="w-8 text-right font-mono text-xs text-muted-foreground">{color[ch.key]}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm">主按钮预览</Button>
        <Button size="sm" variant="outline" onClick={() => void updateThemeColor(null)}>
          恢复默认
        </Button>
      </div>
    </div>
  )
}
