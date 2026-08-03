import { useState } from 'react'
import { Archive, CalendarClock, Check, GraduationCap, History, Network, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import { ProposedEventRow } from './ProposedEventRow'
import {
  isLegacyProposal,
  type LegacyProposalKind,
  type Message,
  type Proposal,
  type ProposedArtifact,
  type ProposedCanvasEdge,
  type ProposedGrowthEvent,
  type ProposedNodeNote,
} from '@/types'

const ARTIFACT_KIND_LABEL: Record<ProposedArtifact['kind'], string> = {
  reflection: '反思',
  document: '文档',
  cheatsheet: '速查表',
  plan: '计划',
  review: '复盘',
  essay: '文书',
  code: '代码',
}

interface ProposalCardProps {
  message: Message
}

/** AI 提案确认卡：pending 可编辑/确认/忽略；confirmed/dismissed 显示结果态 */
export function ProposalCard({ message }: ProposalCardProps) {
  const proposal = message.proposal!
  if (isLegacyProposal(proposal)) return <LegacyProposalCard message={message} proposal={proposal} />
  if (proposal.kind === 'events') return <EventsProposalCard message={message} proposal={proposal} />
  if (proposal.kind === 'canvas') return <CanvasProposalCard message={message} proposal={proposal} />
  if (proposal.kind === 'artifact') return <ArtifactProposalCard message={message} proposal={proposal} />
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
  confirmLabel = '确认',
}: {
  icon: React.ReactNode
  title: string
  status: Proposal['status']
  resultNote?: string
  children: React.ReactNode
  onConfirm?: () => void
  onDismiss: () => void
  confirmLabel?: string
}) {
  return (
    <div
      className={cn(
        'w-full max-w-[85%] rounded-xl border bg-card p-3 shadow-xs',
        status === 'dismissed' && 'opacity-60',
      )}
    >
      <div className="mb-2 flex items-center gap-2 font-medium">
        {icon}
        <Mono>{title}</Mono>
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
          {onConfirm && (
            <Button size="sm" className="gap-1.5" onClick={onConfirm}>
              <Check className="size-3.5" />
              {confirmLabel}
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onDismiss}>
            <X className="size-3.5" />
            忽略
          </Button>
        </div>
      )}
    </div>
  )
}

function EventsProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: 'events' }>
}) {
  const confirmProposal = useChatStore((s) => s.confirmProposal)
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const [events, setEvents] = useState<ProposedGrowthEvent[]>(proposal.events)
  const editable = proposal.status === 'pending'

  const patch = (i: number, next: Partial<ProposedGrowthEvent>) =>
    setEvents((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...next } : e)))

  return (
    <CardShell
      icon={<CalendarClock className="size-4 text-muted-foreground" />}
      title={`事项提案 ${events.length}`}
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id, { ...proposal, events })}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-2.5">
        {events.map((e, i) => (
          <ProposedEventRow key={i} event={e} editable={editable} onChange={(next) => patch(i, next)} />
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
      icon={<GraduationCap className="size-4 text-muted-foreground" />}
      title="档案更新提案"
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id)}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-1">
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

function CanvasProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: 'canvas' }>
}) {
  const confirmProposal = useChatStore((s) => s.confirmProposal)
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const [edges, setEdges] = useState<ProposedCanvasEdge[]>(proposal.edges)
  const [notes, setNotes] = useState<ProposedNodeNote[]>(proposal.notes)
  const editable = proposal.status === 'pending'

  const toggleEdge = (i: number, include: boolean) =>
    setEdges((prev) => prev.map((e, idx) => (idx === i ? { ...e, include } : e)))
  const toggleNote = (i: number, include: boolean) =>
    setNotes((prev) => prev.map((n, idx) => (idx === i ? { ...n, include } : n)))

  const count = edges.length + notes.length

  return (
    <CardShell
      icon={<Network className="size-4 text-muted-foreground" />}
      title={`画板提案 ${count}`}
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id, { ...proposal, edges, notes })}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-1.5">
        {edges.map((e, i) => (
          <div key={`e${i}`} className="flex items-start gap-2">
            {editable && (
              <Checkbox
                className="mt-1"
                checked={e.include && e.resolved}
                disabled={!e.resolved}
                onCheckedChange={(v) => toggleEdge(i, v === true)}
              />
            )}
            <div className={cn('flex min-w-0 flex-1 flex-col', (!e.include || !e.resolved) && 'opacity-50')}>
              <p>
                <span className="font-medium">{e.sourceLabel}</span>
                <span className="mx-1 text-muted-foreground">→</span>
                <span className="font-medium">{e.targetLabel}</span>
                {!e.resolved && <span className="ml-1 text-sm text-destructive">（节点不存在，无法连接）</span>}
              </p>
              {e.reason && <p className="text-sm text-muted-foreground">{e.reason}</p>}
            </div>
          </div>
        ))}
        {notes.map((n, i) => (
          <div key={`n${i}`} className="flex items-start gap-2">
            {editable && (
              <Checkbox
                className="mt-1"
                checked={n.include && n.resolved}
                disabled={!n.resolved}
                onCheckedChange={(v) => toggleNote(i, v === true)}
              />
            )}
            <div className={cn('flex min-w-0 flex-1 flex-col', (!n.include || !n.resolved) && 'opacity-50')}>
              <p>
                <span className="font-medium">{n.label}</span>
                <span className="ml-1 text-muted-foreground">注解：{n.blurb}</span>
                {!n.resolved && <span className="ml-1 text-sm text-destructive">（节点不存在）</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

function ArtifactProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: 'artifact' }>
}) {
  const confirmProposal = useChatStore((s) => s.confirmProposal)
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const [artifacts, setArtifacts] = useState<ProposedArtifact[]>(proposal.artifacts)
  const editable = proposal.status === 'pending'

  const patch = (i: number, next: Partial<ProposedArtifact>) =>
    setArtifacts((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...next } : a)))

  return (
    <CardShell
      icon={<Archive className="size-4 text-muted-foreground" />}
      title={`资产提案 ${artifacts.length}`}
      status={proposal.status}
      resultNote={proposal.resultNote}
      onConfirm={() => void confirmProposal(message.id, { ...proposal, artifacts })}
      onDismiss={() => void dismissProposal(message.id)}
      confirmLabel="保存"
    >
      <div className="flex flex-col gap-2">
        {artifacts.map((a, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg border bg-background/50 p-2">
            {editable && (
              <Checkbox
                className="mt-1.5"
                checked={a.include}
                onCheckedChange={(v) => patch(i, { include: v === true })}
              />
            )}
            <div className={cn('flex min-w-0 flex-1 flex-col gap-1', !a.include && 'opacity-50')}>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="shrink-0">
                  {ARTIFACT_KIND_LABEL[a.kind]}
                </Badge>
                {editable ? (
                  <Input
                    value={a.title}
                    onChange={(e) => patch(i, { title: e.target.value })}
                    className="h-7 min-w-0 flex-1 font-medium"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium">{a.title}</span>
                )}
              </div>
              <p className="line-clamp-6 whitespace-pre-wrap text-sm text-muted-foreground">{a.content}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {a.qa && a.qa.length > 0 && (
                  <Mono className="text-muted-foreground">{a.qa.length} 组问答</Mono>
                )}
                {a.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

const LEGACY_TITLE: Record<LegacyProposalKind, string> = {
  import: '导入提案',
  activities: '活动提案',
  narrative: '叙事线提案',
}

/**
 * S7 及以前的提案，**只渲染不执行**。
 *
 * 这些卡片躺在用户的历史会话里，删掉类型等于让那段历史崩掉；但它们指向的是
 * 已经不存在的数据形状，再让人点「确认」只会写出错的东西。折中就是：
 * 已确认的照常显示结果，还挂着 pending 的说明白已失效，只留「忽略」。
 */
function LegacyProposalCard({
  message,
  proposal,
}: {
  message: Message
  proposal: Extract<Proposal, { kind: LegacyProposalKind }>
}) {
  const dismissProposal = useChatStore((s) => s.dismissProposal)
  const lines =
    proposal.kind === 'import'
      ? [...proposal.events.map((e) => `${e.title} · ${e.date}`), ...proposal.tasks.map((t) => `${t.title} · ${t.dueDate}`)]
      : proposal.kind === 'activities'
        ? proposal.activities.map((a) => a.title)
        : proposal.edges.map((e) => `${e.sourceLabel} → ${e.targetLabel}`)

  return (
    <CardShell
      icon={<History className="size-4 text-muted-foreground" />}
      title={LEGACY_TITLE[proposal.kind]}
      status={proposal.status}
      resultNote={proposal.resultNote}
      onDismiss={() => void dismissProposal(message.id)}
    >
      <div className="flex flex-col gap-0.5 text-muted-foreground">
        {lines.map((line, i) => (
          <p key={i} className="truncate">
            {line}
          </p>
        ))}
        {proposal.status === 'pending' && (
          <p className="mt-1.5 text-sm">这张卡片来自旧版本的数据格式，已无法确认。需要的话把内容重新说一遍即可。</p>
        )}
      </div>
    </CardShell>
  )
}
