import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Mono } from '@/components/ui/mono'
import { cn } from '@/lib/utils'
import { EVENT_CATEGORY_LABEL, type ProposedGrowthEvent } from '@/types'

const PRIORITY_LABEL = { high: '高', medium: '中', low: '低' } as const

interface ProposedEventRowProps {
  event: ProposedGrowthEvent
  editable: boolean
  onChange: (patch: Partial<ProposedGrowthEvent>) => void
}

/**
 * 事项提案的一行。确认卡与导入弹窗共用——两处显示同一种东西，
 * 各写一份迟早会长歪（S7 之前的 events/tasks 两套行就是这么来的）。
 */
export function ProposedEventRow({ event, editable, onChange }: ProposedEventRowProps) {
  const dimmed = !event.include

  return (
    <div className="flex items-start gap-2">
      {editable && (
        <Checkbox
          className="mt-1.5"
          checked={event.include}
          onCheckedChange={(v) => onChange({ include: v === true })}
        />
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col gap-1', dimmed && 'opacity-50')}>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="shrink-0">
            <Mono>{event.kind === 'long' ? '长期' : '短期'}</Mono>
          </Badge>
          <Badge variant="secondary" className="shrink-0">
            {EVENT_CATEGORY_LABEL[event.category]}
          </Badge>
          {event.kind === 'short' && event.priority && (
            <Badge variant="outline" className="shrink-0">
              <Mono>{PRIORITY_LABEL[event.priority]}</Mono>
            </Badge>
          )}
          {editable ? (
            <Input
              value={event.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="h-7 min-w-0 flex-1"
            />
          ) : (
            <span className={cn('min-w-0 flex-1 truncate', dimmed && 'line-through')}>{event.title}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
          {editable ? (
            <>
              <Input
                type="date"
                value={event.startDate}
                onChange={(e) => onChange({ startDate: e.target.value })}
                className="h-7 w-36"
              />
              {event.kind === 'long' && (
                <Input
                  type="date"
                  value={event.endDate ?? ''}
                  placeholder="进行中"
                  onChange={(e) => onChange({ endDate: e.target.value || null })}
                  className="h-7 w-36"
                />
              )}
            </>
          ) : (
            <Mono className="text-muted-foreground">
              {event.startDate || '无日期'}
              {event.kind === 'long' && (event.endDate ? ` → ${event.endDate}` : ' → 进行中')}
            </Mono>
          )}
          {(event.role || event.organization) && (
            <span className="text-sm text-muted-foreground">
              {[event.role, event.organization].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
        {event.achievements && event.achievements.length > 0 && (
          <p className="text-sm text-muted-foreground">🏅 {event.achievements.join('、')}</p>
        )}
      </div>
    </div>
  )
}
