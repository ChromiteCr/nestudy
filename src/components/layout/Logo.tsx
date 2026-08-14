import { cn } from '@/lib/utils'

/**
 * nestudy 标记：`|\\|` —— 四笔，各自独立：
 * 两根立柱 + 被中断切开的两段斜撑。
 *
 * 既是 n，也是画板的基本形：**两个节点与连接它们的一条边**。
 * 学生两年时间在画板上做的就是这件事，标记本身说的也是这件事。
 *
 * 斜撑中间断开而不是一条通到底：中断从 32px 起看得见，16px 下会自然合成
 * 一个实心 N——同一个形在两个尺度上都成立，不必为小尺寸另做一版。
 *
 * 立柱 1.8、斜撑 2.6（/32）：边比节点重，层次照着画板的语义来。
 * 立柱再细到 1.4 在 128px 下更利落，但 16px 时基本消失、只剩一条斜杠，
 * 所以停在 1.8——favicon 要在 16px 立得住，这是硬约束。
 *
 * 只画笔画、不画底板，颜色走 `currentColor`：底板留给使用处
 * （侧栏那块 `bg-primary` 方片），这样明暗两套主题不用在这里各写一遍。
 * 独立的 `public/favicon.svg` 带底板，因为浏览器标签页没有别的容器。
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={cn('size-8', className)}>
      <path d="M6 6h1.8v20H6z" />
      <path d="M24.2 6H26v20h-1.8z" />
      <path d="M9.48 6 16.31 14.33 14.3 15.97 7.47 7.65Z" />
      <path d="M17.7 16.03 24.53 24.35 22.52 26 15.69 17.67Z" />
    </svg>
  )
}
