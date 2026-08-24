import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Check, Download, RefreshCw, Search, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mono } from '@/components/ui/mono'
import { api, ApiError, CRITERION_LABEL, NetworkError, type SkillListing, type SkillSubmissionView } from '@/lib/api'
import { resolveForSkill } from '@/lib/capabilities'
import { parseSkillMarkdown } from '@/lib/skills/parser'
import { useAccountStore } from '@/stores/accountStore'
import { useSkillStore } from '@/stores/skillStore'
import { cn } from '@/lib/utils'

/**
 * 技能商店。
 *
 * 商店那边**故意不核对能力名**——同一个 relay 同时伺候 nes modeling 与 nestudy，
 * 两边的能力词表不一样，服务端硬存一份必然和两个前端一起漂。
 * 权威清单在这里：所以「这个 skill 要的能力我有没有」是**装的时候在本地算**的，
 * 而那正是这件事唯一要紧的时刻。
 */
export function SkillStorePanel() {
  const me = useAccountStore((s) => s.me)
  const [mode, setMode] = useState<'browse' | 'mine'>('browse')

  if (!me) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">商店要先登录。</p>
        <p className="mt-1">
          去「设置 → 账号」用邮箱收个验证码。技能库、对话、画板这些不需要账号，
          一直都能用。
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1">
        {(
          [
            ['browse', '浏览'],
            ['mine', '我发布的'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cn(
              'rounded-sm px-2.5 py-1 text-sm transition-colors',
              mode === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'browse' ? <BrowseTab /> : <MineTab />}
    </div>
  )
}

// ---- 浏览 ----

function BrowseTab() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SkillListing[]>([])
  const [total, setTotal] = useState(0)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('loading')

  const search = useCallback(async (q: string) => {
    setState('loading')
    try {
      const page = await api.listSkills({ q, agent: 'nestudy', limit: 50 })
      setItems(page.items)
      setTotal(page.total)
      setState('idle')
    } catch (error) {
      setState('failed')
      if (!(error instanceof NetworkError)) {
        toast.error(error instanceof Error ? error.message : '没能读到商店')
      }
    }
  }, [])

  useEffect(() => {
    void search('')
  }, [search])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="按名字或说明搜"
            className="pl-8"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search(query.trim())
            }}
          />
        </div>
        <Button variant="secondary" onClick={() => void search(query.trim())}>
          搜索
        </Button>
      </div>

      {state === 'failed' && (
        <p className="text-sm text-muted-foreground">连不上商店。本地的技能库照常可用。</p>
      )}

      {state === 'idle' && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {query ? '没有匹配的技能。' : '商店里还没有东西。第一个发布的可以是你。'}
        </p>
      )}

      {items.length > 0 && (
        <>
          <Mono className="text-muted-foreground">共 {total} 个</Mono>
          {items.map((item) => (
            <StoreCard key={item.id} item={item} />
          ))}
        </>
      )}
    </div>
  )
}

function StoreCard({ item }: { item: SkillListing }) {
  const userSkills = useSkillStore((s) => s.userSkills)
  const saveSkill = useSkillStore((s) => s.saveSkill)
  const [busy, setBusy] = useState(false)

  /**
   * 本地那份和这一条是不是同一个东西。
   *
   * **本地的 name 是唯一的，而商店里的身份是 (作者, 名字)。** 所以「本地有个同名的」
   * 有三种可能：就是这一条、是同名不同作者的另一条、或者是自己写的。
   * 只按名字判会让第二第三种也显示「已安装」——而那两种其实根本装不进来。
   */
  const local = userSkills.find((s) => s.name === item.name)
  const state: 'none' | 'installed' | 'outdated' | 'taken' = !local
    ? 'none'
    : local.source?.authorId !== item.authorId
      ? 'taken'
      : local.source.version === item.version
        ? 'installed'
        : 'outdated'

  /**
   * 装的时候才算缺什么能力。
   *
   * 商店不查这个（它同时伺候两个应用），而**这里有权威的注册表**。
   * 缺了不拦着装——一个少一样本事的 skill 仍然可能有用；但必须当场说出来，
   * 否则学生会在跑到一半的时候撞见「这个能力用不了」，那时候他已经在干活了。
   */
  const install = async () => {
    setBusy(true)
    try {
      const detail = await api.getSkill(item.authorId, item.name)
      const result = await saveSkill(detail.text, 'installed', local?.id, {
        authorId: item.authorId,
        author: item.author,
        version: item.version,
      })
      if (!result.ok) {
        toast.error(result.errors[0] ?? '装不上')
        return
      }

      const parsed = parseSkillMarkdown({ text: detail.text, origin: 'installed', source: item.name })
      const missing = parsed.skill ? resolveForSkill(parsed.skill.manifest).missing : []
      if (missing.length > 0) {
        toast.warning(`装好了，但这里没有它要的能力：${missing.join('、')}`, { duration: 8000 })
      } else {
        toast.success(state === 'outdated' ? `已更新到 v${item.version}` : '已装进技能库')
      }
    } catch (error) {
      if (error instanceof ApiError) toast.error(error.message)
      else toast.error('连不上商店')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {item.displayName !== item.name && (
          <span className="font-medium">{item.displayName}</span>
        )}
        <Mono className="text-muted-foreground">
          {item.name} v{item.version}
        </Mono>
        <Badge variant="outline" className="ml-auto">
          <Mono>{item.skillStatus}</Mono>
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">{item.description}</p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{item.author}</span>
        <Mono>{item.category}</Mono>
        {item.capabilities.length > 0 && (
          <span className="min-w-0">
            要 <Mono className="break-all">{item.capabilities.join(' ')}</Mono>
          </span>
        )}
        <Button
          size="sm"
          variant={state === 'outdated' || state === 'none' ? 'secondary' : 'ghost'}
          className="ml-auto gap-1.5"
          disabled={busy || state === 'installed' || state === 'taken'}
          title={
            state === 'taken'
              ? `本地已经有一个叫 ${item.name} 的技能（${local?.source?.author ?? '你自己写的'}）。技能库里改名或删掉它，才装得下这一份。`
              : undefined
          }
          onClick={() => void install()}
        >
          {state === 'installed' && (
            <>
              <Check className="size-3.5" />
              已安装
            </>
          )}
          {state === 'outdated' && (
            <>
              <RefreshCw className="size-3.5" />
              更新
            </>
          )}
          {state === 'taken' && (
            <>
              <AlertTriangle className="size-3.5" />
              同名已占用
            </>
          )}
          {state === 'none' && (
            <>
              <Download className="size-3.5" />
              安装
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

// ---- 我发布的 ----

function MineTab() {
  const userSkills = useSkillStore((s) => s.userSkills)
  const [subs, setSubs] = useState<SkillSubmissionView[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setSubs((await api.mySubmissions()).items)
    } catch {
      /* 读不到就先空着，下面照样能发布 */
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const publish = async (id: string, text: string) => {
    setBusy(id)
    try {
      const result = await api.publishSkill(text)
      if (result.state === 'listed') {
        toast.success('已上架')
      } else {
        const concerns = result.review.verdicts.filter((v) => v.verdict === 'concern')
        toast.info(`收下了，转人工看一眼：${concerns.map((v) => CRITERION_LABEL[v.criterion]).join('、')}`, {
          duration: 8000,
        })
      }
      await reload()
    } catch (error) {
      if (error instanceof ApiError) {
        const detail = error.detail as { errors?: string[] } | undefined
        toast.error(detail?.errors?.[0] ?? error.message, { duration: 8000 })
      } else {
        toast.error('连不上商店')
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">发布我的技能</h3>
        {userSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            技能库里还没有自己的技能。先做一个，再回来发布。
          </p>
        ) : (
          userSkills.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border bg-card p-3">
              <Mono className="min-w-0 flex-1 break-all">{s.name}</Mono>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                disabled={busy !== null}
                onClick={() => void publish(s.id, s.text)}
              >
                <Upload className="size-3.5" />
                发布
              </Button>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          发布前会有一道模型审核：只看有没有越权诱导、冒充官方、引导外泄、名实不符、
          缺边界、代写。拿不准的转人工，不会直接拒掉。
        </p>
      </section>

      {subs.length > 0 && (
        <section className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-medium">等着的和被退回的</h3>
          {subs.map((sub) => (
            <SubmissionCard key={sub.id} sub={sub} />
          ))}
          <p className="text-xs text-muted-foreground">
            已经上架的不在这里，去「浏览」里找。
          </p>
        </section>
      )}
    </div>
  )
}

function SubmissionCard({ sub }: { sub: SkillSubmissionView }) {
  const concerns = sub.review.verdicts.filter((v) => v.verdict === 'concern')

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Mono>
          {sub.name} v{sub.version}
        </Mono>
        <Badge variant={sub.state === 'rejected' ? 'destructive' : 'secondary'} className="ml-auto">
          {sub.state === 'rejected' ? '被退回' : '等人工看'}
        </Badge>
      </div>

      {sub.review.fault && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {sub.review.fault}
        </p>
      )}

      <ul className="flex flex-col gap-1 text-sm">
        {concerns.map((v) => (
          <li key={v.criterion} className="flex gap-2">
            <Mono className="w-16 shrink-0 text-muted-foreground">{CRITERION_LABEL[v.criterion]}</Mono>
            <span className="min-w-0 text-muted-foreground">{v.note || '没给理由'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
