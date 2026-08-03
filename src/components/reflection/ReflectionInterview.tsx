import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { usePlanningStore } from '@/stores/planningStore'
import { buildSphereNodes } from '@/components/graph/sphere-model'
import { coverageFromDraft, generateReflectionSummary, pickFollowUp, REFLECTION_TEMPLATE } from '@/lib/ai/reflection-ai'
import { applyReflectionDraft, parseReflectionEdges } from '@/lib/ai/proposals'
import { AttachmentPicker } from './AttachmentPicker'
import { ReflectionConfirmCard } from './ReflectionConfirmCard'
import type { Reflection, ReflectionAttachment, ReflectionProposedEdge, ReflectionQA, ReflectionTrigger } from '@/types'

type Step =
  | { kind: 'choose' }
  | { kind: 'draft-write' }
  | { kind: 'qa'; question: string; followUpsLeft: number }
  | { kind: 'summarizing' }
  | { kind: 'confirm'; summary: string; edges: ReflectionProposedEdge[] }

interface ReflectionInterviewProps {
  initialActivityId?: string
  onDone: (reflection: Reflection) => void
  onCancel: () => void
}

const MAX_FOLLOW_UPS = 2

/** 反思采访向导：选关联活动/进入方式 → 逐题问答（含追问）→ AI 总结确认卡 → 入库 */
export function ReflectionInterview({ initialActivityId, onDone, onCancel }: ReflectionInterviewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)

  const [activityId, setActivityId] = useState(initialActivityId ?? '')
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [qa, setQa] = useState<ReflectionQA[]>([])
  const [templateQueue, setTemplateQueue] = useState<number[]>([])
  const [answerDraft, setAnswerDraft] = useState('')
  const [attachment, setAttachment] = useState<ReflectionAttachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [trigger, setTrigger] = useState<ReflectionTrigger>('freeform')

  const activity = activities.find((a) => a.id === activityId)

  const startAiInterview = () => {
    setTrigger(activityId ? 'activity' : 'freeform')
    setTemplateQueue(REFLECTION_TEMPLATE.map((_, i) => i).slice(1))
    setStep({ kind: 'qa', question: REFLECTION_TEMPLATE[0], followUpsLeft: MAX_FOLLOW_UPS })
  }

  const startDraft = () => {
    setTrigger(activityId ? 'activity' : 'freeform')
    setStep({ kind: 'draft-write' })
  }

  const runSummarize = async (finalQa: ReflectionQA[]) => {
    setStep({ kind: 'summarizing' })
    try {
      const nodes = buildSphereNodes(activities, profile)
      const otherLabels = nodes.filter((n) => n.id !== `event:${activityId}`).map((n) => n.label)
      const result = await generateReflectionSummary({
        qa: finalQa,
        activityTitle: activity?.title,
        otherLabels,
      })
      const edges = parseReflectionEdges(result)
      setStep({ kind: 'confirm', summary: result.summary, edges })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 生成总结失败')
      setStep({ kind: 'choose' })
    }
  }

  const submitDraft = async () => {
    const draft = answerDraft.trim()
    if (!draft) return
    setBusy(true)
    try {
      const initialQa: ReflectionQA[] = [{ question: '（自由书写）', answer: draft }]
      const covered = await coverageFromDraft(draft)
      const remaining = REFLECTION_TEMPLATE.map((_, i) => i).filter((i) => !covered.includes(i))
      setQa(initialQa)
      setAnswerDraft('')
      if (remaining.length === 0) {
        await runSummarize(initialQa)
        return
      }
      setTemplateQueue(remaining.slice(1))
      setStep({ kind: 'qa', question: REFLECTION_TEMPLATE[remaining[0]], followUpsLeft: MAX_FOLLOW_UPS })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 分析草稿失败')
    } finally {
      setBusy(false)
    }
  }

  const advanceQueue = async (nextQa: ReflectionQA[]) => {
    if (templateQueue.length === 0) {
      await runSummarize(nextQa)
      return
    }
    const [nextIndex, ...rest] = templateQueue
    setTemplateQueue(rest)
    setStep({ kind: 'qa', question: REFLECTION_TEMPLATE[nextIndex], followUpsLeft: MAX_FOLLOW_UPS })
  }

  const submitAnswer = async () => {
    if (step.kind !== 'qa') return
    const answer = answerDraft.trim()
    if (!answer) return
    const nextQa = [...qa, { question: step.question, answer }]
    setQa(nextQa)
    setAnswerDraft('')
    setBusy(true)
    try {
      if (step.followUpsLeft > 0) {
        const followUp = await pickFollowUp(nextQa, step.question, answer)
        if (followUp) {
          setStep({ kind: 'qa', question: followUp, followUpsLeft: step.followUpsLeft - 1 })
          return
        }
      }
      await advanceQueue(nextQa)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 追问失败，跳过这一步')
      await advanceQueue(nextQa)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (summary: string, edges: ReflectionProposedEdge[]) => {
    const reflection = await applyReflectionDraft({
      title: activity ? `反思：${activity.title}` : `反思 · ${new Date().toLocaleDateString('zh-CN')}`,
      trigger,
      activityId: activityId || undefined,
      qa,
      summary,
      attachments: attachment ? [attachment] : [],
      edges,
    })
    onDone(reflection)
  }

  if (step.kind === 'choose') {
    return (
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        <div>
          <p className="mb-1 text-sm font-medium">关联到活动（可选）</p>
          <Select value={activityId || '__none__'} onValueChange={(v) => setActivityId(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-8 w-full" size="sm">
              <SelectValue placeholder="不关联，独立日记" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不关联，独立日记</SelectItem>
              {activities.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">配图（可选）</p>
          <AttachmentPicker attachment={attachment} onChange={setAttachment} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={startAiInterview}>
            <Sparkles className="size-3.5" />
            AI 带我采访
          </Button>
          <Button size="sm" variant="outline" onClick={startDraft}>
            自己先写草稿
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  if (step.kind === 'draft-write') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">写下你的反思草稿</p>
        <Textarea
          autoFocus
          value={answerDraft}
          onChange={(e) => setAnswerDraft(e.target.value)}
          placeholder="随便写，AI 会根据模板补问你还没提到的点"
          className="min-h-32 text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !answerDraft.trim()} onClick={() => void submitDraft()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : '提交草稿'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  if (step.kind === 'qa') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">{step.question}</p>
        <Textarea autoFocus value={answerDraft} onChange={(e) => setAnswerDraft(e.target.value)} className="min-h-20 text-sm" />
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || !answerDraft.trim()} onClick={() => void submitAnswer()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : '下一步'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  if (step.kind === 'summarizing') {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        AI 正在整理反思总结…
      </div>
    )
  }

  return (
    <ReflectionConfirmCard
      summary={step.summary}
      edges={step.edges}
      onConfirm={(summary, edges) => void confirm(summary, edges)}
      onCancel={onCancel}
    />
  )
}
