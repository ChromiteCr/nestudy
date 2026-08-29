import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Blocks, ClipboardList, Cpu, Database, Download, GraduationCap, Palette, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { Mono } from '@/components/ui/mono'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useSkillStore } from '@/stores/skillStore'
import { useAccountStore } from '@/stores/accountStore'
import { downloadJson, exportAll, importAll } from '@/lib/db/backup'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { AppearancePanel } from './AppearancePanel'
import { BoardPanel } from './BoardPanel'
import { AccountSection } from './AccountPanel'
import { PluginManagerPanel } from '@/components/plugins/PluginManagerPanel'
import { cn } from '@/lib/utils'

export type SettingsCategory = 'model' | 'profile' | 'appearance' | 'plugins' | 'data' | 'board'

interface CategoryDef {
  key: SettingsCategory
  label: string
  icon: typeof Cpu
  /** 只有老师看得见。**真正的边界在服务器**（`/v1/roster` 认 role），这里少画一项只是别去撩拨 */
  teacherOnly?: boolean
}

/**
 * 看板加在设置里而不是导航上：它**只有老师看得见**，为一小撮人在所有人的导轨上
 * 加一格是不划算的，而设置页本来就是分类列表，多一个分类没有这个代价。
 *
 * （S16a 之前这里的理由写的是「`Sidebar.tsx` 说四项是上限」。那条上限已经被
 * S16a 推翻——插件栏可以长——但看板留在设置里的判断没变，只是理由换成了
 * 上面这条：推翻的是「导轨不能再长」，不是「什么都该往导轨上放」。）
 *
 * 插件管理同理留在设置里：它是**配置插件**的地方，不是插件本身；
 * 插件自己的视图在插件栏上各占一格。
 */
const CATEGORIES: CategoryDef[] = [
  { key: 'model', label: '模型', icon: Cpu },
  { key: 'profile', label: '档案', icon: GraduationCap },
  { key: 'appearance', label: '外观', icon: Palette },
  { key: 'plugins', label: '插件', icon: Blocks },
  { key: 'data', label: '数据', icon: Database },
  { key: 'board', label: '看板', icon: ClipboardList, teacherOnly: true },
]

interface SettingsViewProps {
  initialCategory?: SettingsCategory
}

/** 设置是三导航之一的独立视图，不再套 Dialog——对话框里再开对话框是上一版的结构债 */
export function SettingsView({ initialCategory = 'model' }: SettingsViewProps) {
  const [category, setCategory] = useState<SettingsCategory>(initialCategory)
  const isTeacher = useAccountStore((s) => s.me?.role === 'teacher')
  const categories = CATEGORIES.filter((c) => !c.teacherOnly || isTeacher)
  /*
    退出登录、或者换成学生账号之后，本来停在「看板」上的人要被送回去——
    否则他会停在一个已经取不到数据的分类上，看到的是一句 403 错误，
    像是坏了而不是「你不该看这个」。
  */
  const active = categories.some((c) => c.key === category) ? category : 'model'

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b px-6">
        <h1 className="text-lg font-semibold">设置</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-0.5 overflow-x-auto border-b p-3 sm:w-40 sm:flex-col sm:border-b-0 sm:border-r">
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors',
                active === c.key
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
          {active === 'model' && <ModelPanel />}
          {active === 'profile' && <ProfilePanel />}
          {active === 'appearance' && <AppearancePanel />}
          {active === 'plugins' && <PluginManagerPanel />}
          {active === 'data' && <DataPanel />}
          {active === 'board' && <BoardPanel />}
        </div>
      </div>
    </main>
  )
}

/**
 * 档案。**档案与账号合在这一页**，中间那条分隔线上写着两者的区别。
 *
 * 合起来是因为学生心里只有一个「我是谁」，不是「我的账号」和「我的档案」两件事——
 * 分成两栏的结果是他要在两个地方找同一件事。
 *
 * 中间两段话是这一页真正要说的：**你的表达不被代劳，你的数据也不出去。**
 * 它放在两段之间而不是页脚，因为它正好解释了这两样为什么能同页而互不相干。
 */
function ProfilePanel() {
  return (
    <div className="max-w-lg space-y-6">
      <ProfileForm onSaved={() => toast.success('档案已保存')} />

      {/*
        边界看得见。**这一段不是免责声明，是可以拿去核对的承诺。**

        这三条本来只写在各个技能的 SKILL.md 里，而那份说明只有装了技能的人翻得到——
        老师和家长从外面完全看不见，于是「AI 会不会替学生把活动写出来」
        只能靠猜。这一阶段的由来正是一位老师的那句担心：AI 能把碎片写成活动、
        还能翻译成英文，「那就相当于中间跳过了一些步骤」。把答案摆在他看得到的地方。

        **每一条落地时都逐条核过，不是复述文档：**
        ①「压短是编辑、空白处代写是代写」这句原文就在 `activity-list-optimizer` 里；
        ②产品里确实没有翻译功能（全仓唯一那处「翻译」是 `deadline-to-study-plan`
          里的比喻——把截止日「翻译成」这周的具体任务）；
        ③`reflection-interviewer` 的边界一节写着「不替学生反思／不先写一版／
          不润色／不追求圆满」，而 `Artifact.takeaway` 没说就留空是它的代码落点。

        摆在「不上传云端」上面：先说不替你做，再说不传出去，
        合起来是这个产品的两条底线。
      */}
      <div className="space-y-1.5 border-t pt-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">学栖不替你写。</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            不替你写活动描述的第一版。
            <strong className="font-medium text-foreground">
              把你已经写出来的压短是编辑，在空白处替你写是代写
            </strong>
            ——前者做，后者不做。
          </li>
          <li>不替你翻译成英文。这个功能在产品里根本不存在。</li>
          <li>
            不替你把经历总结成成长感悟。反思访谈只负责问，
            「下次会怎么做」那一栏你没说过就留空——
            <strong className="font-medium text-foreground">空着是实话，编一句不是</strong>。
          </li>
        </ul>
        <p>
          这些边界原本只写在每个技能的说明里，而那份说明
          <strong className="font-medium text-foreground">只有你自己翻得到</strong>
          。写在这儿，是为了让它对老师和家长也是一句能拿去核对的话。
        </p>
      </div>

      <div className="space-y-1.5 border-t pt-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">你写的这些也不上传云端。</p>
        <p>
          档案、事项、反思、画板、资产全都只在这台设备上，
          <strong className="font-medium text-foreground">一字都没上传过</strong>
          ——换设备靠「数据」页里的手动导出导入。
        </p>
        <p>
          下面的账号是另一回事：它只承载身份、用量与发布。服务器存的是你的邮箱、
          用了多少额度、你发布到商店的 skill。转发模型请求时是无状态透传，对话内容不落日志。
        </p>
      </div>

      <AccountSection />
    </div>
  )
}

/**
 * 模型通道。
 *
 * 两条路的区别不是「贵不贵」，是**请求经不经过我们的服务器**——
 * 自带 Key 时浏览器直连服务商，我们连你问了什么都不知道；免费通道要经过转发，
 * 虽然不落对话日志，但那毕竟是一次经手。这件事要写在选项里，不是写在文档里。
 */
function ModelPanel() {
  const modelConfig = useSettingsStore((s) => s.modelConfig)
  const updateModelConfig = useSettingsStore((s) => s.updateModelConfig)
  // `hasToken` 不是 `me`：断网时问不到服务器，`me` 是 null 但人确实登录过。
  // 这一页得和 `resolveProvider` 那道门说同一件事
  const signedIn = useAccountStore((s) => s.hasToken)
  const free = modelConfig.tier === 'free'

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ChannelOption
          active={free}
          title="用我的账号"
          note={
            signedIn
              ? '请求经服务器转发，额度按 token 算。对话内容不落日志。'
              : '要先在「档案」里登录。请求经服务器转发，对话内容不落日志。'
          }
          onSelect={() => void updateModelConfig({ tier: 'free' })}
        />
        <ChannelOption
          active={!free}
          title="自带 Key"
          note={
            signedIn
              ? '任何兼容 OpenAI 协议的服务商都能用。浏览器直连，Key 只存在本机，请求不经过任何中间服务器。'
              : '也要先在「档案」里登录。登录之后浏览器直连，Key 只存在本机，请求不经过任何中间服务器。'
          }
          onSelect={() => void updateModelConfig({ tier: 'custom' })}
        />
      </div>

      {free ? (
        <p className="text-sm text-muted-foreground">
          {signedIn
            ? '模型与上下文窗口由服务器定，这里不用配。'
            : '还没登录——去左边的「档案」用邮箱收个验证码。'}
        </p>
      ) : (
        <>
          {!signedIn && (
            /* 这一条要写清楚「登录不等于把东西交给我们」。不写的话，
               「自带 Key 也要登录」读起来就像是对话要绕道服务器了——
               而那正好是选这条通道的人最在意的一件事 */
            <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              <strong className="font-medium text-foreground">还没登录。</strong>
              两条通道都要先登录，自带 Key 也一样——去左边的「档案」用邮箱收个验证码。
              登录<strong className="font-medium text-foreground">不改变</strong>下面这件事：
              你的 Key 和对话仍然只在这台设备和你自己选的服务商之间，一个字节都不经过我们。
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            填的是<strong className="font-medium text-foreground">协议</strong>不是厂商：只要它实现了 OpenAI 的{' '}
            <Mono>/chat/completions</Mono>，
            官方、DeepSeek、国内各家、自建的 vLLM 或 Ollama 都行。
            <strong className="font-medium text-foreground">唯一的硬条件是支持 function calling</strong>
            ——这个应用的技能与能力全靠它，不支持的模型能聊天但做不了事。
          </p>
          <TextField
            label="API Key"
            type="password"
            value={modelConfig.apiKey}
            className="font-mono"
            hint="在服务商后台创建。只存在这台设备上，不会上传"
            onChange={(e) => void updateModelConfig({ apiKey: e.target.value })}
          />
          <TextField
            label="API Base URL"
            value={modelConfig.baseURL}
            className="font-mono"
            hint="到 /v1 之前那一截，例如 https://api.deepseek.com。结尾多一个斜杠不要紧，会自动去掉"
            onChange={(e) => void updateModelConfig({ baseURL: e.target.value })}
          />
          <TextField
            label="模型"
            value={modelConfig.model}
            className="font-mono"
            hint="服务商文档里那个 id，例如 deepseek-chat、gpt-4o-mini、qwen-max"
            onChange={(e) => void updateModelConfig({ model: e.target.value })}
          />
          <TextField
            label="上下文窗口（token）"
            type="number"
            min={4000}
            step={1000}
            value={modelConfig.contextWindow}
            className="font-mono"
            hint="决定对话涨到多长时自动压缩成摘要。换模型时按它的窗口改，填小了会频繁压缩，填大了会撞上模型上限。"
            onChange={(e) => void updateModelConfig({ contextWindow: Number(e.target.value) || 0 })}
          />
        </>
      )}
    </div>
  )
}

function ChannelOption({
  active,
  title,
  note,
  onSelect,
}: {
  active: boolean
  title: string
  note: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex flex-col gap-0.5 rounded-sm border p-3 text-left transition-colors',
        active ? 'border-foreground/30 bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </button>
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
