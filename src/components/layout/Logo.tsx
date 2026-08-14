import { cn } from '@/lib/utils'

/**
 * nestudy 标记：`|\|` —— 两根立柱 + 一条斜撑。
 *
 * 既是 n，也是画板的基本形：**两个节点与连接它们的一条边**。
 * 学生两年时间在画板上做的就是这件事，标记本身说的也是这件事。
 *
 * 三笔之间留缝（2 个单位），不是连笔的 N：大尺寸下看得出这是构造出来的三笔，
 * 16px 下缝会自然填实成一个实心 N——同一个形在两个尺度上都成立，
 * 不需要为小尺寸另做一版。
 *
 * 只画笔画、不画底板，颜色走 `currentColor`：底板留给使用处
 * （侧栏那块 `bg-primary` 方片），这样明暗两套主题不用在这里各写一遍。
 * 独立的 `public/favicon.svg` 带底板，因为浏览器标签页没有别的容器。
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={cn('size-8', className)}>
      <path d="M6 7h4v18H6z" />
      <path d="M22 7h4v18h-4z" />
      <path d="M12.77 7.55 22.55 22.23 19.23 24.45 9.45 9.77Z" />
    </svg>
  )
}
