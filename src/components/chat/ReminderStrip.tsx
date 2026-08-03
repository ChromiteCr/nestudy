import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useReminderStore } from '@/stores/reminderStore'
import { useSkillStore } from '@/stores/skillStore'
import { getSkill } from '@/lib/skills/registry'

/**
 * 主动式 Agent 的提醒从面板搬到了聊天顶部——面板视图已删，
 * 而「主动开口」这件事本来就该发生在对话里。
 */
export function ReminderStrip() {
  const reminders = useReminderStore((s) => s.reminders)
  const dismiss = useReminderStore((s) => s.dismiss)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)
  const activities = usePlanningStore((s) => s.activities)

  if (reminders.length === 0) return null

  const handle = (r: (typeof reminders)[number]) => {
    if (r.suggestSkillId) {
      useSkillStore.getState().setActiveSkill(r.suggestSkillId)
      const skill = getSkill(r.suggestSkillId)
      setPendingPrompt(`帮我用「${skill?.name ?? '这个 skill'}」分析一下`)
    } else if (r.reflectActivityId) {
      // 反思工作室已删除，反思改由对话完成（S10 会换成 reflection-interviewer skill）
      const activity = activities.find((a) => a.id === r.reflectActivityId)
      setPendingPrompt(`带我反思一下「${activity?.title ?? '这个活动'}」，一次问我一个问题。`)
    } else if (r.prompt) {
      setPendingPrompt(r.prompt)
    }
    void dismiss(r.key)
  }

  return (
    <div className="flex flex-col gap-2 border-b px-4 py-3">
      {reminders.map((r) => (
        <div key={r.key} className="flex items-start gap-3 rounded-sm border bg-card px-3 py-2">
          <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <Mono className="block">{r.title}</Mono>
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{r.body}</p>
          </div>
          <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => handle(r)}>
            去处理
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label="关闭提醒"
            onClick={() => void dismiss(r.key)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}
