import { useState } from 'react'
import { Check, CircleHelp, SkipForward } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { Mono } from '@/components/ui/mono'
import { useChatStore } from '@/stores/chatStore'
import { cn } from '@/lib/utils'
import type { AskAnswer, AskQuestion, Message } from '@/types'

/**
 * 提问卡。
 *
 * 与提案卡长得像，做的事完全不同：提案卡是"要不要把这些写进你的数据"，
 * 提问卡是"我缺一个前提，你选一下"。所以它没有勾选入库那套编辑面，
 * 只有选项、一个自己写的口子、和一个跳过。
 *
 * 「其他（自己写）」不是可选装饰，是这张卡的安全阀：
 * 选项是 agent 猜的，学生的真实情况没理由被四个格子框住。同理还有整张跳过——
 * 不想答的时候必须有一条不答也能往下走的路，否则卡片就成了路障。
 */

const OTHER = '其他（自己写）'

interface AskCardProps {
  message: Message
}

export function AskCard({ message }: AskCardProps) {
  const ask = message.ask!
  const answerAsk = useChatStore((s) => s.answerAsk)
  const skipAsk = useChatStore((s) => s.skipAsk)
  const streaming = useChatStore((s) => s.streaming)

  /** 每题选中的选项文字；「其他」以 OTHER 占位，提交时换成手写内容 */
  const [picked, setPicked] = useState<string[][]>(() => ask.questions.map(() => []))
  const [others, setOthers] = useState<string[]>(() => ask.questions.map(() => ''))

  const pending = ask.status === 'pending'

  const toggle = (qi: number, label: string, multi: boolean) => {
    setPicked((prev) =>
      prev.map((sel, i) => {
        if (i !== qi) return sel
        if (!multi) return sel.includes(label) ? [] : [label]
        return sel.includes(label) ? sel.filter((v) => v !== label) : [...sel, label]
      }),
    )
  }

  const resolve = (qi: number): string[] =>
    picked[qi].flatMap((v) => (v === OTHER ? (others[qi].trim() ? [others[qi].trim()] : []) : [v]))

  // 每题都得有答案才能提交：漏答一题，agent 拿到的就是残缺前提
  const ready = ask.questions.every((_, qi) => resolve(qi).length > 0)

  const submit = () => {
    const answers: AskAnswer[] = ask.questions.map((q, qi) => ({
      header: q.header,
      question: q.question,
      selected: resolve(qi),
    }))
    void answerAsk(message.id, answers)
  }

  return (
    <div className={cn('w-full max-w-[85%] rounded-xl border bg-card p-3 shadow-xs', !pending && 'opacity-80')}>
      <div className="mb-2.5 flex items-center gap-2 font-medium">
        <CircleHelp className="size-4 text-muted-foreground" />
        <Mono>{ask.questions.length > 1 ? `请你选一下 ${ask.questions.length}` : '请你选一下'}</Mono>
        {ask.status === 'answered' && (
          <Badge className="ml-auto gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="outline">
            <Check className="size-3" />
            已回答
          </Badge>
        )}
        {ask.status === 'skipped' && (
          <Badge variant="outline" className="ml-auto text-muted-foreground">
            已跳过
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {ask.questions.map((q, qi) => (
          <QuestionBlock
            key={qi}
            question={q}
            answered={ask.answers?.[qi]?.selected}
            pending={pending}
            picked={picked[qi]}
            other={others[qi]}
            onToggle={(label) => toggle(qi, label, q.multiSelect)}
            onOther={(text) => setOthers((prev) => prev.map((v, i) => (i === qi ? text : v)))}
          />
        ))}
      </div>

      {pending && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" className="gap-1.5" disabled={!ready || streaming} onClick={submit}>
            <Check className="size-3.5" />
            提交
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={streaming}
            onClick={() => void skipAsk(message.id)}
          >
            <SkipForward className="size-3.5" />
            跳过，你先做
          </Button>
        </div>
      )}
    </div>
  )
}

interface QuestionBlockProps {
  question: AskQuestion
  /** 已作答时的结果，只读展示 */
  answered?: string[]
  pending: boolean
  picked: string[]
  other: string
  onToggle: (label: string) => void
  onOther: (text: string) => void
}

function QuestionBlock({ question, answered, pending, picked, other, onToggle, onOther }: QuestionBlockProps) {
  const options = pending ? [...question.options, { label: OTHER }] : question.options

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Mono className="text-muted-foreground">{question.header}</Mono>
        <span className="min-w-0 text-sm">{question.question}</span>
        {question.multiSelect && pending && <Mono className="text-2xs text-muted-foreground">可多选</Mono>}
      </div>

      {answered ? (
        <div className="flex flex-wrap gap-1.5">
          {answered.map((v, i) => (
            <Badge key={i} variant="secondary">
              {v}
            </Badge>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {options.map((o) => {
            const on = picked.includes(o.label)
            return (
              <button
                key={o.label}
                type="button"
                role={question.multiSelect ? 'checkbox' : 'radio'}
                aria-checked={on}
                disabled={!pending}
                onClick={() => onToggle(o.label)}
                className={cn(
                  'flex items-start gap-2 rounded-sm border px-2.5 py-1.5 text-left text-sm transition-colors',
                  on ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/60',
                  !pending && 'cursor-default opacity-70',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-3.5 shrink-0 items-center justify-center border',
                    question.multiSelect ? 'rounded-[3px]' : 'rounded-full',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50',
                  )}
                >
                  {on && <Check className="size-2.5" />}
                </span>
                <span className="min-w-0">
                  {o.label}
                  {o.description && <span className="text-muted-foreground"> —— {o.description}</span>}
                </span>
              </button>
            )
          })}

          {pending && picked.includes(OTHER) && (
            <TextField
              label="你的情况是……"
              size="sm"
              wrapClassName="mt-0.5"
              autoFocus
              value={other}
              onChange={(e) => onOther(e.target.value)}
            />
          )}
        </div>
      )}
    </div>
  )
}
