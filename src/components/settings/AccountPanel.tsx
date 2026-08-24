import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mono } from '@/components/ui/mono'
import { ApiError, NetworkError, type Tier } from '@/lib/api'
import { useAccountStore } from '@/stores/accountStore'

/**
 * 账号。
 *
 * 这一页要一直说清楚一件事：**没有账号，这个应用照样是完整的。**
 * 学习数据从来没有离开过这台浏览器，登录换来的只有免费模型通道和 skill 商店。
 * 把这句话写在页面上，而不是写在文档里——会去读文档的人本来就不担心这个。
 */
export function AccountPanel() {
  const { me, loading, offline, load, signOut } = useAccountStore()

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="text-sm text-muted-foreground">正在确认登录状态…</p>
  }

  return (
    <div className="max-w-lg space-y-6">
      {me ? <SignedIn onSignOut={signOut} /> : <SignInForm />}

      {offline && !me && (
        <p className="text-sm text-muted-foreground">
          连不上服务器。本地的一切照常可用——事项、反思、画板、档案都在这台设备上。
        </p>
      )}

      <div className="space-y-1.5 border-t pt-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">账号只承载身份、用量与发布。</p>
        <p>
          服务器存的是：你的邮箱、用了多少额度、你发布到商店的 skill。
          <strong className="font-medium text-foreground">不存</strong>
          事项、反思、画板、资产、档案——那些一字都没上传过，跨设备靠手动导出导入。
        </p>
        <p>转发模型请求时是无状态透传，对话内容不落日志。</p>
      </div>
    </div>
  )
}

const TIER_LABEL: Record<Tier, string> = { tutor: '对话', quick: '整理' }

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

      <div className="space-y-1.5">
        <Label htmlFor="account-name">名字</Label>
        <div className="flex gap-2">
          <Input
            id="account-name"
            className="flex-1"
            value={name}
            maxLength={40}
            placeholder="别人在商店里看到的署名"
            onChange={(e) => setName_(e.target.value)}
          />
          <Button onClick={() => void save()} disabled={saving || name.trim() === (me.name ?? '')}>
            保存
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          留空的话，商店里显示的是邮箱 @ 前面那一截。
        </p>
      </div>

      <div className="space-y-2">
        <Label>本周额度</Label>
        {(Object.keys(me.quotas) as Tier[]).map((tier) => {
          const q = me.quotas[tier]
          const left = Math.max(0, q.limit - q.used)
          return (
            <div key={tier} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{TIER_LABEL[tier] ?? tier}</span>
              <Mono>
                {left} / {q.limit}
              </Mono>
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">周一零点恢复。</p>
      </div>
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
        <div className="space-y-1.5">
          <Label htmlFor="account-code">验证码</Label>
          <Input
            id="account-code"
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="邮件里那六位"
            className="font-mono tracking-widest"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && code.trim()) void confirm()
            }}
          />
          <p className="text-xs text-muted-foreground">
            发到了 <Mono>{email.trim()}</Mono>，十分钟内有效。
          </p>
        </div>
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
      <div className="space-y-1.5">
        <Label htmlFor="account-email">邮箱</Label>
        <Input
          id="account-email"
          type="email"
          autoComplete="email"
          value={email}
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && email.trim()) void send()
          }}
        />
      </div>

      {needsInvite && (
        <div className="space-y-1.5">
          <Label htmlFor="account-invite">邀请码</Label>
          <Input
            id="account-invite"
            value={invite}
            placeholder="从组织者那里拿"
            onChange={(e) => setInvite(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">只在第一次登录时要，之后只输邮箱。</p>
        </div>
      )}

      <Button onClick={() => void send()} disabled={busy || !email.trim()}>
        发送验证码
      </Button>
    </div>
  )
}
