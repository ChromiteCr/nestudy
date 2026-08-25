import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TextField } from '@/components/ui/text-field'
import { Mono } from '@/components/ui/mono'
import { ApiError, NetworkError, type QuotaView } from '@/lib/api'
import { useAccountStore } from '@/stores/accountStore'

/**
 * 账号那一段。**它和档案表单同在「档案」一页**，中间隔着一句话说清两者的区别：
 * 上面那些留在这台设备上，下面这个只承载身份、用量与发布。
 *
 * 合到一页是因为学生心里本来就只有一个「我是谁」，而不是「我的账号」和「我的档案」
 * 两件事；分成两栏的结果是他要在两个地方找同一件事。
 */
export function AccountSection() {
  const { me, loading, offline, load, signOut } = useAccountStore()

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="text-sm text-muted-foreground">正在确认登录状态…</p>
  }

  return (
    <div className="space-y-6">
      {me ? <SignedIn onSignOut={signOut} /> : <SignInForm />}

      {offline && !me && (
        <p className="text-sm text-muted-foreground">
          连不上服务器。本地的一切照常可用——事项、反思、画板、档案都在这台设备上。
        </p>
      )}
    </div>
  )
}

function SignedIn({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const me = useAccountStore((s) => s.me)!
  const setName = useAccountStore((s) => s.setName)
  const refreshQuota = useAccountStore((s) => s.refreshQuota)
  const [name, setName_] = useState(me.name ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void refreshQuota()
  }, [refreshQuota])

  const save = async () => {
    setSaving(true)
    try {
      await setName(name.trim())
      toast.success('名字已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <Mono className="text-sm">{me.email}</Mono>
        <Button variant="ghost" size="sm" onClick={() => void onSignOut()}>
          退出登录
        </Button>
      </div>

      <div className="flex items-start gap-2">
        <TextField
          label="名字"
          wrapClassName="flex-1"
          value={name}
          maxLength={40}
          hint="别人在商店里看到的署名。留空的话显示的是邮箱 @ 前面那一截"
          onChange={(e) => setName_(e.target.value)}
        />
        <Button
          className="h-13 shrink-0"
          onClick={() => void save()}
          disabled={saving || name.trim() === (me.name ?? '')}
        >
          保存
        </Button>
      </div>

      <QuotaBar quota={me.quota} />
    </div>
  )
}

/**
 * 登录：邮箱 → 验证码两步。
 *
 * **邀请码那一栏一开始不显示。** 名单里的人不需要它，先问所有人要一个多数人
 * 用不上的东西，会让「登录」看起来像「申请入会」。服务器回 `invite_required`
 * 的时候再把它露出来——那一刻要它才是有理由的。
 */
function SignInForm() {
  const { requestCode, verify } = useAccountStore()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState('')
  const [needsInvite, setNeedsInvite] = useState(false)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    setBusy(true)
    try {
      await requestCode(email.trim(), needsInvite ? invite.trim() : undefined)
      setStep('code')
      toast.success('验证码已发出，十分钟内有效')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invite_required') {
        setNeedsInvite(true)
        toast.info('这个邮箱还不在名单里，填一下邀请码')
      } else if (error instanceof NetworkError) {
        toast.error('连不上服务器')
      } else {
        toast.error(error instanceof Error ? error.message : '没能发出验证码')
      }
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    try {
      await verify(email.trim(), code.trim())
      toast.success('登录成功')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '验证失败')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'code') {
    return (
      <div className="space-y-3">
        <TextField
          label="验证码"
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="font-mono tracking-widest"
          hint={
            <>
              发到了 <Mono>{email.trim()}</Mono>，十分钟内有效。
            </>
          }
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && code.trim()) void confirm()
          }}
        />
        <div className="flex gap-2">
          <Button onClick={() => void confirm()} disabled={busy || !code.trim()}>
            登录
          </Button>
          <Button variant="ghost" onClick={() => setStep('email')} disabled={busy}>
            换个邮箱
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <TextField
        label="邮箱"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && email.trim()) void send()
        }}
      />

      {needsInvite && (
        <TextField
          label="邀请码"
          value={invite}
          hint="从组织者那里拿。只在第一次登录时要，之后只输邮箱"
          onChange={(e) => setInvite(e.target.value)}
        />
      )}

      <Button onClick={() => void send()} disabled={busy || !email.trim()}>
        发送验证码
      </Button>
    </div>
  )
}

/**
 * 本周还剩多少。
 *
 * **给比例不给那个七位数。** 「还剩 1,847,203 / 2,000,000」等于没说——
 * 没有人对 token 有直觉，而一个看不懂的额度和没有额度是一回事。
 *
 * 倍数不是 1 的时候一定要写出来：一个 0.1 倍的人只看到「额度很少」会以为产品坏了，
 * 看到「你的倍数是 0.1」才知道那是设定。
 */
function QuotaBar({ quota }: { quota: QuotaView }) {
  const ratio = quota.limitTokens > 0 ? Math.min(1, quota.usedTokens / quota.limitTokens) : 1
  const left = Math.max(0, 1 - ratio)
  const tight = left <= 0.1

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label>本周还剩</Label>
        <Mono className={tight ? 'text-destructive' : 'text-muted-foreground'}>
          {Math.round(left * 100)}%
        </Mono>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] ${tight ? 'bg-destructive/70' : 'bg-foreground/40'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        周一零点恢复。按实际用量计——一次技能运行要跑好几轮，比单问一句花得多
        {quota.multiplier !== 1 && `。你的额度倍数是 ${quota.multiplier}`}
      </p>
    </div>
  )
}
