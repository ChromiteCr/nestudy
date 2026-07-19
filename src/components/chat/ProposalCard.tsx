import { useState } from 'react'
import { CalendarClock, Check, GraduationCap, ListTodo, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import type { Message, Proposal, ProposedEvent, ProposedTask } from '@/types'

const EVENT_TYPE_LABEL = { exam: '考试', deadline: '截止', activity: '活动' } as const
const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' } as const

interface ProposalCardProps {
  message: Message
}

/** AI 提案确认卡：pending 可编辑/确认/忽略；confirmed/dismissed 显示结果态 */
export function ProposalCard({ message }: ProposalCardProps) {
  const proposal = message.proposal!
  if (proposal.kind === 'import') return <ImportProposalCard message={message} proposal={proposal} />
  return <ProfileProposalCard message={message} proposal={proposal} />
}

function CardShell({
  icon,
  title,
  status,
  resultNote,
  children,
  onConfirm,
  onDismiss,
}: {
  icon: React.ReactNode
  title: string
  status: Proposal['status']
  resultNote?: string
  children: React.ReactNode
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div
      className={cn(
        'w-full max-w-[85%] rounded-xl border bg-card p-3 shadow-xs',
        status === 'dismissed' && 'opacity-60',
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
        {status === 'confirmed' && (
          <Badge className="ml-auto gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="outline">
            <Check className="size-3" />
            {resultNote ?? '已确认'}
          </Badge>
        )}
        {status === 'dismissed' && (
          <Badge variant="outline" className="ml-auto text-muted-foreground">
            已忽略
          </Badge>
        )}
      </div>
      {children}
      {status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={onConfirm}>
            <Check className="size-3.5" />
            确认
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onDismiss}>
            <X className="size-3.5" />
            忽略
          </Button>
        </div>
      )}
    </div>
  )
}

function ImportProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: 'import' }>
}) {
  const confirmProposal = useChatStore((s) => s.confirmProposal)
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const [events, setEvents] = useState<ProposedEvent[]>(proposal.events)
  const [tasks, setTasks] = useState<ProposedTask[]>(proposal.tasks)
  const editable = proposal.status === 'pending'

  const patchEvent = (i: number, patch: Partial<ProposedEvent>) =>
    setEvents((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  const patchTask = (i: number, patch: Partial<ProposedTask>) =>
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))

  return (
    <CardShell
      icon={<CalendarClock className="size-4 text-primary" />}
      title="导入提案"
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id, { ...proposal, events, tasks })}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-1.5">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-2">
            {editable && (
              <Checkbox checked={e.include} onCheckedChange={(v) => patchEvent(i, { include: v === true })} />
            )}
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {EVENT_TYPE_LABEL[e.type]}
            </Badge>
            {editable ? (
              <>
                <Input
                  value={e.title}
                  onChange={(ev) => patchEvent(i, { title: ev.target.value })}
                  className="h-7 flex-1 text-sm"
                />
                <Input
                  type="date"
                  value={e.date}
                  onChange={(ev) => patchEvent(i, { date: ev.target.value })}
                  className="h-7 w-34"
                />
              </>
            ) : (
              <span className={cn('flex-1 truncate text-sm', !e.include && 'line-through opacity-50')}>
                {e.title} · {e.date}
              </span>
            )}
          </div>
        ))}
        {tasks.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            {editable && (
              <Checkbox checked={t.include} onCheckedChange={(v) => patchTask(i, { include: v === true })} />
            )}
            <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {PRIORITY_LABEL[t.priority]}
            </Badge>
            {editable ? (
              <>
                <Input
                  value={t.title}
                  onChange={(ev) => patchTask(i, { title: ev.target.value })}
                  className="h-7 flex-1 text-sm"
                />
                <Input
                  type="date"
                  value={t.dueDate}
                  onChange={(ev) => patchTask(i, { dueDate: ev.target.value })}
                  className="h-7 w-34"
                />
              </>
            ) : (
              <span className={cn('flex-1 truncate text-sm', !t.include && 'line-through opacity-50')}>
                {t.title} · {t.dueDate}
              </span>
            )}
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function ProfileProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: 'profile' }>
}) {
  const confirmProposal = useChatStore((s) => s.confirmProposal)
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const { patch } = proposal

  return (
    <CardShell
      icon={<GraduationCap className="size-4 text-primary" />}
      title="档案更新提案"
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id)}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-1 text-sm">
        {patch.name !== undefined && (
          <p>
            名字：<span className="font-medium">{patch.name}</span>
          </p>
        )}
        {patch.grade !== undefined && (
          <p>
            年级：<span className="font-medium">{patch.grade} 年级</span>
          </p>
        )}
        {patch.curriculum !== undefined && (
          <p>
            课程体系：<span className="font-medium">{patch.curriculum}</span>
          </p>
        )}
        {patch.courses && patch.courses.length > 0 && (
          <div>
            <p className="text-muted-foreground">课程（{patch.courses.length} 门）：</p>
            <ul className="ml-4 list-disc">
              {patch.courses.map((c, i) => (
                <li key={i}>
                  {c.name}（{c.level}
                  {c.currentGrade && ` · 当前 ${c.currentGrade}`}
                  {c.targetGrade && ` → 目标 ${c.targetGrade}`}）
                </li>
              ))}
            </ul>
          </div>
        )}
        {patch.targetSchools && patch.targetSchools.length > 0 && (
          <div>
            <p className="text-muted-foreground">目标学校（{patch.targetSchools.length} 所）：</p>
            <ul className="ml-4 list-disc">
              {patch.targetSchools.map((s, i) => (
                <li key={i}>
                  {s.name}
                  {s.major && ` · ${s.major}`}
                  {s.round && s.round !== 'Other' && ` · ${s.round}`}
                  {s.deadline && ` · ${s.deadline}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </CardShell>
  )
}
