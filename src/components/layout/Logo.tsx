import { cn } from '@/lib/utils'

/**
 * nestudy 标记：`|\\|` —— 四笔，各自独立：两根立柱 + 两条平行斜撑。
 *
 * 立柱 1.6、斜撑 2.6（/32）：斜撑是主笔，立柱只是把它框住的两道边。
 * 四笔之间的三处缝按走廊宽度均分，所以**立柱收细缝会跟着变宽**——
 * 16px 下反而比粗立柱分得更开，这跟直觉相反但渲染出来就是这样。
 * 没有继续探到 1.2：128px 下更利落，16px 时立柱基本消失只剩两道斜杠。
 *
 * 只画笔画、不画底板，颜色走 `currentColor`：底板留给使用处
 * （侧栏那块 `bg-primary` 方片），这样明暗两套主题不用在这里各写一遍。
 * 独立的 `public/favicon.svg` 带底板，因为浏览器标签页没有别的容器。
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className={cn('size-8', className)}>
      <path d="M6 6h1.6v20H6z" />
      <path d="M24.4 6H26v20h-1.6z" />
      <path d="M11.78 6 18.48 25.14 16.03 26 9.33 6.86Z" />
      <path d="M15.97 6 22.67 25.14 20.22 26 13.52 6.86Z" />
    </svg>
  )
}
