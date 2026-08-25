import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload, Wand2, Trash2, FileDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'
import { useSkillStore } from '@/stores/skillStore'
import { listCapabilities, resolveForSkill } from '@/lib/capabilities'
import {
  listBuiltinSkills,
  listSkillLoadIssues,
  OUTPUT_LABEL,
  SKILLS_SOURCE,
  type LoadedSkill,
} from '@/lib/skills'
import { downloadSkillBundle, downloadSkillMarkdown, readSkillFile } from '@/lib/skills/transfer'
import { SkillStorePanel } from './SkillStorePanel'
import { cn } from '@/lib/utils'
import type { UserSkillOrigin } from '@/types'

/**
 * 技能库。
 *
 * S7 把导航收敛到三项，这里是有意加回的第四项——自建 skill 之后，
 * 「我有哪些技能、它能碰什么、导出给别人」变成日常动作，塞进设置子页
 * 等于把常用的东西藏进配置里。设置页原本的 Skills 子页整体搬到这里，
 * 不留两处。
 */

const CATEGORY_LABEL: Record<string, string> = {
  'study-planning': '学习规划与成长',
  'skill-authoring': '技能创作',
  'coding-helper': '编程工作流',
  modeling: '数学建模',
  'reading-notes': '阅读笔记',
  'research-coaching': '科研引导',
  'competition-literacy': '竞赛素养',
  'vocabulary-learning': '词汇学习',
  'social-practice': '社会实践',
}

const KIND_LABEL = { read: '读取', propose: '提案', ask: '提问' } as const

function topCategory(category: string): string {
  return category.split('/')[0] ?? category
}

interface SkillsViewProps {
  onOpenChat: () => void
}

export function SkillsView({ onOpenChat }: SkillsViewProps) {
  const userSkills = useSkillStore((s) => s.userSkills)
  const saveSkill = useSkillStore((s) => s.saveSkill)
  const removeSkill = useSkillStore((s) => s.removeSkill)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const fileRef = useRef<HTMLInputElement>(null)
  // 商店和技能库分两页，不是一长条：商店有自己的搜索、安装、发布流程，
  // 混在本地技能列表下面会让「我有什么」和「别人有什么」看起来是一回事
  const [tab, setTab] = useState<'library' | 'store'>('library')

  // 内置那批是常量，自建那批从 store 读——不走 listSkills() 的模块缓存，
  // 那份缓存对 React 是不可见依赖，组件不知道它什么时候变了
  const mine = useSkillStore((s) => s.loadedSkills)
  const userIssues = useSkillStore((s) => s.issues)

  const builtinGroups = useMemo(() => {
    const map = new Map<string, LoadedSkill[]>()
    for (const s of listBuiltinSkills()) {
      const key = topCategory(s.manifest.category)
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [])

  const errors = [...listSkillLoadIssues().errors.filter((e) => !e.startsWith('我的技能/')), ...userIssues.errors]

  const handleImport = async (files: FileList | null) => {
    if (!files?.length) return
    let ok = 0
    const failures: string[] = []
    for (const file of files) {
      const { skills: texts, errors } = await readSkillFile(file)
      failures.push(...errors)
      for (const item of texts) {
        const result = await saveSkill(item.text, 'imported')
        if (result.ok) ok++
        else failures.push(`${item.label}：${result.errors.join('；')}`)
      }
    }
    if (ok > 0) toast.success(`导入了 ${ok} 个技能`)
    // 逐条报失败原因：整包只说"导入失败"，用户无从下手
    for (const message of failures) toast.error(message)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-semibold">技能</h1>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.json"
            multiple
            className="hidden"
            onChange={(e) => void handleImport(e.target.files)}
          />
          {tab === 'library' && (
          <>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
            <Upload className="size-3.5" />
            导入
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setPendingPrompt('/skill-creator 我想做一个自己的技能')
              onOpenChat()
            }}
          >
            <Wand2 className="size-3.5" />
            做一个技能
          </Button>
          </>
          )}
        </header>

        <div className="-mt-3 flex gap-1">
          {(
            [
              ['library', '技能库'],
              ['store', '商店'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'rounded-sm px-2.5 py-1 text-sm transition-colors',
                tab === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'store' && <SkillStorePanel />}

        {tab === 'library' && (
        <>

        <p className="text-sm text-muted-foreground">
          技能是声明式的学习流程，本身不含可执行代码，只能调用下面列出的能力，且写入一律要你在卡片上确认。
          导出的是原样的 SKILL.md，可以直接给别人用，也能放进 Claude Code。
        </p>

        {errors.length > 0 && (
          <div className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <span className="font-medium text-destructive">有技能未能装载</span>
            {errors.map((e, i) => (
              <Mono key={i} className="text-destructive">
                {e}
              </Mono>
            ))}
          </div>
        )}

        {mine.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">我的技能</h2>
              <Mono className="text-muted-foreground">{mine.length}</Mono>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto gap-1.5"
                onClick={() => downloadSkillBundle(userSkills)}
              >
                <FileDown className="size-3.5" />
                全部导出
              </Button>
            </div>
            {mine.map((s) => (
              <SkillCard
                key={s.manifest.name}
                skill={s}
                origin={userSkills.find((u) => u.id === s.userSkillId)?.origin}
                onExport={() => {
                  const row = userSkills.find((u) => u.id === s.userSkillId)
                  if (row) downloadSkillMarkdown(row)
                }}
                onDelete={() => {
                  if (s.userSkillId) void removeSkill(s.userSkillId).then(() => toast.success('已删除'))
                }}
              />
            ))}
          </section>
        )}

        {builtinGroups.map(([category, list]) => (
          <section key={category} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">{CATEGORY_LABEL[category] ?? category}</h2>
              <Mono className="text-muted-foreground">{list.length}</Mono>
            </div>
            {list.map((s) => (
              <SkillCard key={s.manifest.name} skill={s} />
            ))}
          </section>
        ))}

        <div className="flex flex-col gap-2 border-t pt-4">
          <span className="text-sm text-muted-foreground">全部可用能力（{listCapabilities().length}）</span>
          {(['read', 'propose', 'ask'] as const).map((kind) => {
            const group = listCapabilities().filter((c) => c.kind === kind)
            if (group.length === 0) return null
            return (
              <div key={kind} className="flex gap-2 text-sm">
                <Mono className="w-14 shrink-0 text-muted-foreground">{KIND_LABEL[kind]}</Mono>
                <ul className="grid min-w-0 flex-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                  {group.map((c) => (
                    <li key={c.name} className="min-w-0" title={c.summary}>
                      {c.label} <Mono className="break-all text-muted-foreground">{c.name}</Mono>
                      {/* 这几个不在「没声明就给全部读」那一份里：它们花钱，而且会把字发出这台设备 */}
                      {c.requiresDeclaration && (
                        <span
                          className="ml-1 rounded bg-muted px-1 py-0.5 text-[0.7em] text-muted-foreground"
                          title="skill 必须在 SKILL.md 里点名声明才拿得到"
                        >
                          需声明
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          <span className="text-sm text-muted-foreground">
            内置技能来源：<Mono>{SKILLS_SOURCE.repo}</Mono> @ <Mono>{SKILLS_SOURCE.commit}</Mono>（Library{' '}
            <Mono>{SKILLS_SOURCE.libraryVersion}</Mono>）
          </span>
        </div>
        </>
        )}
      </div>
    </main>
  )
}

/** 来源标签。**装来的不能标成「自建」**——这次商店设计的重点就是出处始终看得见 */
const ORIGIN_LABEL: Record<UserSkillOrigin, string> = {
  created: '自建',
  imported: '导入',
  installed: '商店',
}

interface SkillCardProps {
  skill: LoadedSkill
  /** 只有「我的技能」那一栏有；内置的没有来源可言 */
  origin?: UserSkillOrigin
  onExport?: () => void
  onDelete?: () => void
}

function SkillCard({ skill, origin, onExport, onDelete }: SkillCardProps) {
  const [open, setOpen] = useState(false)
  const { granted } = resolveForSkill(skill.manifest)
  const m = skill.manifest

  return (
    <div className="group flex flex-col gap-1.5 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {m.displayName !== m.name && <span className="font-medium">{m.displayName}</span>}
        <Mono className="text-muted-foreground">
          {m.name} v{m.version}
        </Mono>
        {origin && <Badge variant="secondary">{ORIGIN_LABEL[origin]}</Badge>}
        <Badge variant="outline" className="ml-auto">
          <Mono>{m.status}</Mono>
        </Badge>
      </div>

      <p className="text-2xs text-muted-foreground">{m.description}</p>

      <dl className="mt-1 flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">能力</dt>
          <dd className="min-w-0">
            {m.readOnly ? (
              <span className="text-muted-foreground">未声明，按只读运行（{granted.length} 项读能力）</span>
            ) : (
              <Mono className="break-all">{granted.map((c) => c.name).join(' · ')}</Mono>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">产出</dt>
          <dd>{m.outputs.map((o) => OUTPUT_LABEL[o]).join('、')}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">轮数上限</dt>
          <dd>
            <Mono>{m.maxRounds}</Mono>
          </dd>
        </div>
      </dl>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '收起正文' : '看正文'}
        </button>
        <div className="flex-1" />
        {onExport && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onExport}>
            <Download className="size-3.5" />
            导出
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            aria-label={`删除 ${m.displayName}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      {open && (
        <pre className={cn('max-h-96 overflow-auto rounded-sm border bg-muted/40 p-2 text-2xs whitespace-pre-wrap')}>
          {skill.body}
        </pre>
      )}
    </div>
  )
}
