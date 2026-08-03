import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { parseImportText } from '@/lib/ai/import'
import { applyProposal } from '@/lib/capabilities'
import { ProposedEventRow } from './ProposedEventRow'
import type { ProposedGrowthEvent } from '@/types'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 粘贴即导入：文字 → AI 解析 → 可编辑预览 → 确认入库 */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState<ProposedGrowthEvent[] | null>(null)

  const reset = () => {
    setText('')
    setPreview(null)
    setParsing(false)
  }

  const handleParse = async () => {
    setParsing(true)
    try {
      const events = await parseImportText(text)
      if (events.length === 0) toast.info('没有识别出带日期的事项，试试补充日期信息')
      else setPreview(events)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解析失败，请重试')
    } finally {
      setParsing(false)
    }
  }

  const handleConfirm = async () => {
    if (!preview) return
    const note = await applyProposal({ kind: 'events', events: preview, status: 'pending' })
    toast.success(note)
    reset()
    onOpenChange(false)
  }

  const patch = (i: number, next: Partial<ProposedGrowthEvent>) =>
    setPreview((prev) => prev && prev.map((e, idx) => (idx === i ? { ...e, ...next } : e)))

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
            把微信群通知、邮件、考试安排直接粘贴进来，学栖帮你解析成事项。
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
            <div className="flex max-h-80 flex-col gap-2.5 overflow-y-auto">
              {preview.map((e, i) => (
                <ProposedEventRow key={i} event={e} editable onChange={(next) => patch(i, next)} />
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
