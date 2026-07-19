import { Bird } from 'lucide-react'

/** AI 处理中的指示：栖枝小鸟轻轻起伏（呼应"学栖"）+ 节奏点 */
export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
        <Bird className="size-4.5 animate-[nest-bob_1.2s_ease-in-out_infinite] text-primary" />
      </div>
      <span>学栖思考中</span>
      <span className="flex items-center gap-0.5">
        <span className="size-1 animate-bounce rounded-full bg-current" />
        <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
        <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
      </span>
    </div>
  )
}
