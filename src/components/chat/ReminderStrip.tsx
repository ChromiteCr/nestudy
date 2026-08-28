import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'
import { useReminderStore } from '@/stores/reminderStore'
import { getSkill } from '@/lib/skills'

/**
 * 主动式 Agent 的提醒从面板搬到了聊天顶部——面板视图已删，
 * 而「主动开口」这件事本来就该发生在对话里。
 */
export function ReminderStrip() {
  const reminders = useReminderStore((s) => s.reminders)
  const dismiss = useReminderStore((s) => s.dismiss)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  if (reminders.length === 0) return null

  const handle = (r: (typeof reminders)[number]) => {
    if (r.suggestSkillName) {
      // 和用户自己敲 /<skill-name> 走同一条路：agent 自己去 read_skill，
      // 不再有一个"已激活但还没读定义"的中间态
      const skill = getSkill(r.suggestSkillName)
      setPendingPrompt(`/${r.suggestSkillName} 帮我用「${skill?.manifest.displayName ?? '这个 skill'}」分析一下`)
    } else if (r.prompt) {
      setPendingPrompt(r.prompt)
    }
    void dismiss(r.key)
  }

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3">
      {reminders.map((r) => (
        <div
          key={r.key}
          className="flex flex-col gap-2 rounded-md border bg-card px-3 py-2 sm:flex-row sm:items-start sm:gap-3"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Bell className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <Mono className="block">{r.title}</Mono>
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{r.body}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1">
            {/*
              没有去处的提醒不给按钮。主线那条就是这样一条：它只把两样东西并排摆出来，
              说完一句事实就该闭嘴——给它一个「去处理」等于把这条提醒的解释权交回模型。
              （已知遗留：`handle` 走的 newConversation 会把旧会话里 pending 的问题卡
              永远留在 pending。本项不新增这条触发路径，也不在这一项里修它）
            */}
            {(r.prompt || r.suggestSkillName) && (
              <Button variant="outline" size="sm" className="h-7" onClick={() => handle(r)}>
                去处理
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="关闭提醒"
              onClick={() => void dismiss(r.key)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
