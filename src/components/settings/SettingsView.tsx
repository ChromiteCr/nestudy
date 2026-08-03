import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Cpu, Database, Download, GraduationCap, Palette, Puzzle, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mono } from '@/components/ui/mono'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore } from '@/stores/planningStore'
import { downloadJson, exportAll, importAll } from '@/lib/db/backup'
import { listCapabilities, resolveForSkill } from '@/lib/capabilities'
import { listSkillLoadIssues, listSkills, OUTPUT_LABEL, SKILLS_SOURCE } from '@/lib/skills'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { AppearancePanel } from './AppearancePanel'
import { cn } from '@/lib/utils'

export type SettingsCategory = 'model' | 'profile' | 'skills' | 'appearance' | 'data'

const CATEGORIES: { key: SettingsCategory; label: string; icon: typeof Cpu }[] = [
  { key: 'model', label: '模型', icon: Cpu },
  { key: 'profile', label: '档案', icon: GraduationCap },
  { key: 'skills', label: 'Skills', icon: Puzzle },
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
          {category === 'skills' && <SkillsPanel />}
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
    </div>
  )
}

/**
 * 已装载的 skill 与它们的授权范围。
 *
 * 把"这个 skill 能碰什么"摊在明面上，是能力白名单这套机制唯一能被用户验证的地方——
 * 只写在代码里的守卫，对用户来说等于不存在。S12 的商店会在这一页长出来。
 */
function SkillsPanel() {
  const skills = listSkills()
  const capabilities = listCapabilities()
  const issues = listSkillLoadIssues()

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Skill 是声明式的学习流程，本身不含可执行代码，只能调用下面列出的能力，且写入一律要你在卡片上确认。
      </p>

      <div className="flex flex-col gap-3">
        {skills.map((s) => {
          const { granted } = resolveForSkill(s.manifest)
          return (
            <div key={s.manifest.name} className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{s.manifest.displayName}</span>
                <Mono className="text-muted-foreground">
                  {s.manifest.name} v{s.manifest.version}
                </Mono>
                <Badge variant="outline" className="ml-auto">
                  <Mono>{s.manifest.status}</Mono>
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{s.manifest.description}</p>
              <dl className="mt-1 flex flex-col gap-1 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted-foreground">能力</dt>
                  <dd className="min-w-0">
                    {s.manifest.readOnly ? (
                      <span className="text-muted-foreground">未声明，按只读运行（{granted.length} 项读能力）</span>
                    ) : (
                      <Mono>{granted.map((c) => c.name).join(' · ')}</Mono>
                    )}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted-foreground">产出</dt>
                  <dd>{s.manifest.outputs.map((o) => OUTPUT_LABEL[o]).join('、')}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted-foreground">轮数上限</dt>
                  <dd>
                    <Mono>{s.manifest.maxRounds}</Mono>
                  </dd>
                </div>
              </dl>
            </div>
          )
        })}
        {skills.length === 0 && <p className="text-sm text-muted-foreground">没有装载任何 skill。</p>}
      </div>

      {issues.errors.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span className="font-medium text-destructive">有 skill 未能装载</span>
          {issues.errors.map((e, i) => (
            <Mono key={i} className="text-destructive">
              {e}
            </Mono>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 border-t pt-3 text-sm text-muted-foreground">
        <span>
          全部可用能力（{capabilities.length}）：<Mono>{capabilities.map((c) => c.name).join(' · ')}</Mono>
        </span>
        <span>
          Skill 来源：<Mono>{SKILLS_SOURCE.repo}</Mono> @ <Mono>{SKILLS_SOURCE.commit}</Mono>（Library{' '}
          <Mono>{SKILLS_SOURCE.libraryVersion}</Mono>）
        </span>
      </div>
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
      await Promise.all([useChatStore.getState().init(), usePlanningStore.getState().load()])
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
