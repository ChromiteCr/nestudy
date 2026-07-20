import { useState } from 'react'
import { CalendarClock, Check, GraduationCap, ListTodo, Network, Sparkles, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_CATEGORY_LABEL,
  ACTIVITY_LEVEL_LABEL,
  type Message,
  type Proposal,
  type ProposedActivity,
  type ProposedEdge,
  type ProposedEvent,
  type ProposedTask,
} from '@/types'

const EVENT_TYPE_LABEL = { exam: '考试', deadline: '截止', activity: '活动' } as const
const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' } as const

interface ProposalCardProps {
  message: Message
}

/** AI 提案确认卡：pending 可编辑/确认/忽略；confirmed/dismissed 显示结果态 */
export function ProposalCard({ message }: ProposalCardProps) {
  const proposal = message.proposal!
  if (proposal.kind === 'import') return <ImportProposalCard message={message} proposal={proposal} />
  if (proposal.kind === 'activities') return <ActivitiesProposalCard message={message} proposal={proposal} />
  if (proposal.kind === 'narrative') return <NarrativeProposalCard message={message} proposal={proposal} />
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

function ActivitiesProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: 'activities' }>
}) {
  const confirmProposal = useChatStore((s) => s.confirmProposal)
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const [activities, setActivities] = useState<ProposedActivity[]>(proposal.activities)
  const editable = proposal.status === 'pending'

  const patchActivity = (i: number, patch: Partial<ProposedActivity>) =>
    setActivities((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))

  return (
    <CardShell
      icon={<Sparkles className="size-4 text-primary" />}
      title={`活动提案（${activities.length}）`}
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id, { ...proposal, activities })}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-2">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border bg-background/50 p-2">
            {editable && (
              <Checkbox
                className="mt-0.5"
                checked={a.include}
                onCheckedChange={(v) => patchActivity(i, { include: v === true })}
              />
            )}
            <div className={cn('flex min-w-0 flex-1 flex-col gap-1', !a.include && 'opacity-50')}>
              <div className="flex items-center gap-1.5">
                {editable ? (
                  <Input
                    value={a.title}
                    onChange={(e) => patchActivity(i, { title: e.target.value })}
                    className="h-7 flex-1 text-sm font-medium"
                  />
                ) : (
                  <span className="truncate text-sm font-medium">{a.title}</span>
                )}
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {ACTIVITY_CATEGORY_LABEL[a.category]}
                </Badge>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {ACTIVITY_LEVEL_LABEL[a.level]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {[a.role, a.organization].filter(Boolean).join(' · ')}
                {a.startDate && ` · ${a.startDate}${a.endDate ? ` ~ ${a.endDate}` : ' 至今'}`}
              </p>
              {a.description && <p className="text-xs">{a.description}</p>}
              {a.achievements.length > 0 && (
                <p className="text-xs text-muted-foreground">🏅 {a.achievements.join('、')}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function NarrativeProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: 'narrative' }>
}) {
  const confirmProposal = useChatStore((s) => s.confirmProposal)
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const [edges, setEdges] = useState<ProposedEdge[]>(proposal.edges)
  const editable = proposal.status === 'pending'

  const toggle = (i: number, include: boolean) =>
    setEdges((prev) => prev.map((e, idx) => (idx === i ? { ...e, include } : e)))

  return (
    <CardShell
      icon={<Network className="size-4 text-primary" />}
      title={`叙事线提案（${edges.length}）`}
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id, { ...proposal, edges })}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-1.5">
        {edges.map((e, i) => {
          const unresolved = !e.sourceNodeId || !e.targetNodeId
          return (
            <div key={i} className="flex items-start gap-2">
              {editable && (
                <Checkbox
                  className="mt-0.5"
                  checked={e.include && !unresolved}
                  disabled={unresolved}
                  onCheckedChange={(v) => toggle(i, v === true)}
                />
              )}
              <div className={cn('flex min-w-0 flex-1 flex-col', (!e.include || unresolved) && 'opacity-50')}>
                <p className="text-sm">
                  <span className="font-medium">{e.sourceLabel}</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="font-medium">{e.targetLabel}</span>
                  {unresolved && (
                    <span className="ml-1 text-xs text-destructive">（未匹配到节点，无法连接）</span>
                  )}
                </p>
                {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </CardShell>
  )
}
