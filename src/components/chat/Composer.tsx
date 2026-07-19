import { useRef, useState } from 'react'
import { ArrowUp, ClipboardPaste, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useChatStore } from '@/stores/chatStore'
import { ImportDialog } from './ImportDialog'

export function Composer() {
  const [value, setValue] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streaming = useChatStore((s) => s.streaming)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)

  const submit = () => {
    const content = value.trim()
    if (!content || streaming) return
    setValue('')
    void sendMessage(content)
  }

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border bg-card p-2 shadow-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="粘贴导入" onClick={() => setImportOpen(true)}>
              <ClipboardPaste className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>粘贴通知/邮件，AI 解析为日程任务</TooltipContent>
        </Tooltip>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            // 自适应高度
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder="问点什么…（Enter 发送，Shift+Enter 换行）"
          className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {streaming ? (
          <Button size="icon" variant="secondary" aria-label="停止生成" onClick={stopStreaming}>
            <Square className="size-4" />
          </Button>
        ) : (
          <Button size="icon" aria-label="发送" disabled={!value.trim()} onClick={submit}>
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
        数据 100% 存于本地浏览器 · 自带 Key 模式下请求直连模型服务商
      </p>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
