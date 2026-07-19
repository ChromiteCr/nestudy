import { useState } from 'react'
import { toast } from 'sonner'
import { CalendarClock, Check, ListTodo, Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { parseImportText } from '@/lib/ai/import'
import { applyImportProposal } from '@/lib/ai/proposals'
import type { ProposedEvent, ProposedTask } from '@/types'

const EVENT_TYPE_LABEL = { exam: '考试', deadline: '截止', activity: '活动' } as const
const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' } as const

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 粘贴即导入：文字 → AI 解析 → 可编辑预览 → 确认入库 */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState<{ events: ProposedEvent[]; tasks: ProposedTask[] } | null>(null)

  const reset = () => {
    setText('')
    setPreview(null)
    setParsing(false)
  }

  const handleParse = async () => {
    setParsing(true)
    try {
      const result = await parseImportText(text)
      if (result.events.length === 0 && result.tasks.length === 0) {
        toast.info('没有识别出带日期的事项，试试补充日期信息')
      } else {
        setPreview(result)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解析失败，请重试')
    } finally {
      setParsing(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    const note = await applyImportProposal(preview.events, preview.tasks)
    toast.success(note)
    reset()
    onOpenChange(false)
  }

  const patchEvent = (i: number, patch: Partial<ProposedEvent>) =>
    setPreview((p) => p && { ...p, events: p.events.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) })
  const patchTask = (i: number, patch: Partial<ProposedTask>) =>
    setPreview((p) => p && { ...p, tasks: p.tasks.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>粘贴即导入</DialogTitle>
          <DialogDescription>
            把微信群通知、邮件、考试安排直接粘贴进来，学栖帮你解析成日程和任务。
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col gap-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'例如：\n各位同学，AP微积分BC考试定于5月11日上午8点，请5月1日前完成报名缴费…'}
              className="min-h-36"
            />
            <Button disabled={!text.trim() || parsing} onClick={() => void handleParse()} className="gap-1.5">
              {parsing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {parsing ? '解析中…' : 'AI 解析'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {preview.events.map((e, i) => (
                <div key={`e${i}`} className="flex items-center gap-2">
                  <Checkbox checked={e.include} onCheckedChange={(v) => patchEvent(i, { include: v === true })} />
                  <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {EVENT_TYPE_LABEL[e.type]}
                  </Badge>
                  <Input value={e.title} onChange={(ev) => patchEvent(i, { title: ev.target.value })} className="h-7 flex-1 text-sm" />
                  <Input type="date" value={e.date} onChange={(ev) => patchEvent(i, { date: ev.target.value })} className="h-7 w-34" />
                </div>
              ))}
              {preview.tasks.map((t, i) => (
                <div key={`t${i}`} className="flex items-center gap-2">
                  <Checkbox checked={t.include} onCheckedChange={(v) => patchTask(i, { include: v === true })} />
                  <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {PRIORITY_LABEL[t.priority]}
                  </Badge>
                  <Input value={t.title} onChange={(ev) => patchTask(i, { title: ev.target.value })} className="h-7 flex-1 text-sm" />
                  <Input type="date" value={t.dueDate} onChange={(ev) => patchTask(i, { dueDate: ev.target.value })} className="h-7 w-34" />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button className="gap-1.5" onClick={() => void handleConfirm()}>
                <Check className="size-4" />
                确认导入
              </Button>
              <Button variant="outline" onClick={() => setPreview(null)}>
                返回修改
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
