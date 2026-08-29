import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { api, ApiError, NetworkError, type BoardUser } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * 看板。**老师专用。**
 *
 * 回答的只有一个问题：名单上有谁，今天各用掉了多少。
 *
 * ## 这里看不到学生的学习内容，一个字都看不到
 *
 * 服务器上从来就没有事项、反思、画板、档案——设置页那段边界说明写着
 * 「一字都没上传过」，这张表不能是那句话的例外。所以它只显示身份与用量，
 * 也就是那段话里已经承认服务器会存的东西：邮箱、用了多少额度。
 * **老师想知道学生在学什么，得去问学生，不能来这里看。**
 *
 * ## 为什么不显示合计
 *
 * 这台 relay 同时服务学栖和 modeling，而 `usage` 表里没有分应用的列。
 * 一个「今天全站共 N 次调用」的大字会被读成学栖的数字，实际是两边之和——
 * 那种数字比不给更糟。逐行的数也有同样的性质，所以表下面写明了它算的是什么。
 */
export function BoardPanel() {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ready'; day: string; users: BoardUser[] } | { kind: 'error'; message: string }
  >({ kind: 'loading' })

  const load = async () => {
    setState({ kind: 'loading' })
    try {
      const data = await api.roster()
      // 按邮箱排，**不按今日用量排**。按用量降序就是一张排行榜，
      // 而名单是名单；老师要找某个人时，稳定的字母序比「谁今天用得多」好使
      const users = [...data.students].sort((a, b) => a.email.localeCompare(b.email))
      setState({ kind: 'ready', day: data.day, users })
    } catch (error) {
      // 连不上和被拒绝是两件事，一个该重试一个不该——照 api 客户端那对异常分开说
      if (error instanceof ApiError) {
        setState({ kind: 'error', message: error.status === 403 ? '这个账号不是老师，看不了名单。' : error.message })
      } else if (error instanceof NetworkError) {
        setState({ kind: 'error', message: '连不上服务器。' })
      } else {
        setState({ kind: 'error', message: '没能取到名单。' })
      }
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">名单与今日用量</span>
          {state.kind === 'ready' && <Mono className="text-muted-foreground">今天 {state.day}</Mono>}
        </div>
        <Button variant="outline" size="sm" className="h-7" onClick={() => void load()}>
          刷新
        </Button>
      </div>

      {state.kind === 'loading' && <p className="text-sm text-muted-foreground">正在取名单…</p>}
      {state.kind === 'error' && <p className="text-sm text-destructive">{state.message}</p>}

      {state.kind === 'ready' && state.users.length === 0 && (
        <p className="text-sm text-muted-foreground">名单上还没有人。</p>
      )}

      {state.kind === 'ready' && state.users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <Th>账号</Th>
                <Th className="text-right">今日调用</Th>
                <Th className="text-right">今日 token</Th>
                <Th className="text-right">最后活跃</Th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((u) => (
                <tr key={u.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      {/* 名字是学生自己填的，没填就只显示邮箱——不从邮箱前缀猜一个出来 */}
                      {u.name && <span className="font-medium">{u.name}</span>}
                      <Mono className="text-muted-foreground">{u.email}</Mono>
                      {u.role === 'teacher' && <Mono className="text-muted-foreground">老师</Mono>}
                      {u.blocked && <Mono className="text-destructive">已停用</Mono>}
                      {/* 倍数只在不是 1 的时候写。一个 0.1 倍的账号「用得少」是设定，
                          不写出来，那一行的两个数就会被读成「这人没在学」 */}
                      {u.multiplier !== 1 && (
                        <Mono className="text-muted-foreground">×{u.multiplier}</Mono>
                      )}
                    </div>
                  </td>
                  {/*
                    今天没动静的显示成**灰色的 0，不是空白**：空白会被读成
                    「没这个数」，而 0 是一个确凿的结论——他今天一次也没问过。
                    （modeling 那张看板上是同一个决定，两边保持一致）
                  */}
                  <td className="px-3 py-2 text-right">
                    <Mono className={cn(u.callsToday === 0 && 'text-muted-foreground')}>{u.callsToday}</Mono>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Mono className={cn(u.tokensToday === 0 && 'text-muted-foreground')}>
                      {compact(u.tokensToday)}
                    </Mono>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Mono className={cn(u.lastSeenAt ? 'text-muted-foreground' : 'text-destructive')}>
                      {u.lastSeenAt ? day(u.lastSeenAt) : '没登录过'}
                    </Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        这不是免责声明，是这张表的读法。缺了它，两个 0 会被读成「这人今天没学习」，
        而他可能整天都在自己写东西、一次也没问过 AI；
        更要紧的是这台服务器同时服务两个站，数字是合在一起的。
      */}
      <div className="space-y-1.5 border-t pt-4 text-sm text-muted-foreground">
        <p>
          <strong className="font-medium text-foreground">这两列数的是「问过 AI 几次」，不是「学了多少」。</strong>
          一整天自己写、一次没问，这里就是两个 0。
        </p>
        <p>
          这台服务器同时服务学栖和另一个站，用量表里不分站，
          <strong className="font-medium text-foreground">所以上面的数是两边合在一起的</strong>。
          日界按服务器的 UTC+8 算，和额度归零同一个口径。
        </p>
        <p>
          名单上只有账号与用量。事项、反思、画板、档案从来没有上传过，
          <strong className="font-medium text-foreground">这里也看不到</strong>。
        </p>
      </div>
    </div>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-3 py-2 text-left font-medium text-muted-foreground', className)}>
      <Mono>{children}</Mono>
    </th>
  )
}

/** 大数收成 12.3k / 1.2M，表格里对齐好读；小于 1000 原样给 */
function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function day(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}
