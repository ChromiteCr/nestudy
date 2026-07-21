import { useEffect, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { deleteAttachment, getAttachmentURL, opfsSupported, saveAttachment } from '@/lib/storage/opfs'
import type { ReflectionAttachment } from '@/types'

interface AttachmentPickerProps {
  attachment: ReflectionAttachment | null
  onChange: (attachment: ReflectionAttachment | null) => void
}

/** 单张图片附件：本地 OPFS 存储，不做任何上传/分析；浏览器不支持 OPFS 时整个入口隐藏 */
export function AttachmentPicker({ attachment, onChange }: AttachmentPickerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl(null)
      return
    }
    let url: string | null = null
    void getAttachmentURL(attachment.ref).then((u) => {
      url = u
      setPreviewUrl(u)
    })
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [attachment])

  if (!opfsSupported()) return null

  const pick = async (file: File) => {
    setBusy(true)
    try {
      if (attachment) await deleteAttachment(attachment.ref)
      const ref = await saveAttachment(file)
      onChange({ id: crypto.randomUUID(), kind: 'image', ref })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (attachment) await deleteAttachment(attachment.ref)
    onChange(null)
  }

  return (
    <div className="flex items-center gap-2">
      {previewUrl ? (
        <div className="relative">
          <img src={previewUrl} alt="反思附图" className="h-16 w-16 rounded-md border object-cover" />
          <button
            type="button"
            aria-label="移除图片"
            className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
            onClick={() => void remove()}
          >
            <X className="size-2.5" />
          </button>
        </div>
      ) : (
        <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:bg-muted/30">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          <span className="text-[10px]">配图</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pick(file)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}
