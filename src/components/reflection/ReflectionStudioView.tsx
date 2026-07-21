import { useEffect, useState } from 'react'
import { ImageIcon, NotebookPen, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { useReflectionUiStore } from '@/stores/reflectionUiStore'
import { getAttachmentURL } from '@/lib/storage/opfs'
import { ReflectionInterview } from './ReflectionInterview'
import type { AppView, Reflection } from '@/types'

interface ReflectionStudioViewProps {
  onNavigate: (view: AppView) => void
}

const TRIGGER_LABEL: Record<Reflection['trigger'], string> = {
  activity: '关联活动',
  freeform: '独立日记',
  agent: '学栖提醒',
}

/** 反思工作室：列表 + 开始新反思（独立采访视图，不与主聊天共用界面） */
export function ReflectionStudioView({ onNavigate }: ReflectionStudioViewProps) {
  const reflections = usePlanningStore((s) => s.reflections)
  const activities = usePlanningStore((s) => s.activities)
  const removeReflection = usePlanningStore((s) => s.removeReflection)
  const pendingActivityId = useReflectionUiStore((s) => s.pendingActivityId)
  const pendingOpenId = useReflectionUiStore((s) => s.pendingOpenId)

  const [creating, setCreating] = useState(false)
  const [presetActivityId, setPresetActivityId] = useState<string | undefined>(undefined)
  const [openId, setOpenId] = useState<string | null>(null)

  // 从活动卡「反思一下」/星图卫星/提醒卡跳转：带上预置的上下文。
  // 从 getState() 复核最新值：StrictMode 下 effect 会连跑两次，第二次已被清空，避免重复触发。
  useEffect(() => {
    const store = useReflectionUiStore.getState()
    if (store.pendingActivityId) {
      setPresetActivityId(store.pendingActivityId)
      setCreating(true)
      store.setPendingActivityId(null)
    }
    if (store.pendingOpenId) {
      setOpenId(store.pendingOpenId)
      store.setPendingOpenId(null)
    }
  }, [pendingActivityId, pendingOpenId])

  const openReflection = reflections.find((r) => r.id === openId)

  const startNew = () => {
    setPresetActivityId(undefined)
    setCreating(true)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl font-semibold">反思</h1>
            <p className="text-sm text-muted-foreground">
              {reflections.length > 0 ? `${reflections.length} 条反思` : 'AI 采访式反思，记录经历背后的思考'}
            </p>
          </div>
          {!creating && (
            <Button size="sm" className="gap-1.5" onClick={startNew}>
              <Plus className="size-3.5" />
              开始新反思
            </Button>
          )}
        </header>

        {creating && (
          <ReflectionInterview
            initialActivityId={presetActivityId}
            onDone={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        )}

        {openReflection && (
          <ReflectionDetail
            reflection={openReflection}
            onClose={() => setOpenId(null)}
            onDelete={() => {
              void removeReflection(openReflection.id)
              setOpenId(null)
            }}
          />
        )}

        <div className="flex flex-col gap-2">
          {reflections.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/30"
              onClick={() => setOpenId(r.id)}
            >
              <NotebookPen className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium">{r.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {TRIGGER_LABEL[r.trigger]}
                  </Badge>
                  {r.attachments.length > 0 && <ImageIcon className="size-3 text-muted-foreground" />}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
              </div>
            </button>
          ))}
          {reflections.length === 0 && !creating && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <p>
                还没有反思。
                {activities.length > 0 ? '点「开始新反思」，或去活动页对某个经历「反思一下」。' : '点「开始新反思」写下第一条。'}
              </p>
              {activities.length === 0 && (
                <Button size="sm" variant="outline" onClick={() => onNavigate('activities')}>
                  去添加活动
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ReflectionDetail({
  reflection,
  onClose,
  onDelete,
}: {
  reflection: Reflection
  onClose: () => void
  onDelete: () => void
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    const attachment = reflection.attachments[0]
    if (!attachment) {
      setImageUrl(null)
      return
    }
    let url: string | null = null
    void getAttachmentURL(attachment.ref).then((u) => {
      url = u
      setImageUrl(u)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [reflection.attachments])

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium">{reflection.title}</h2>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive" onClick={onDelete}>
            <Trash2 className="size-3.5" />
            删除
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
      {imageUrl && <img src={imageUrl} alt="反思附图" className="max-h-48 rounded-md border object-cover" />}
      <p className="text-sm">{reflection.summary}</p>
      <div className="flex flex-col gap-2 border-t pt-2">
        {reflection.qa.map((qa, i) => (
          <div key={i} className="text-xs">
            <p className="font-medium text-muted-foreground">{qa.question}</p>
            <p>{qa.answer}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
