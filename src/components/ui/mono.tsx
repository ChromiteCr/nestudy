import type { ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MonoProps {
  children: ReactNode
  className?: string
  as?: ElementType
}

/**
 * 机器声：系统说的话——时间、倒计时、计数、字符数、skill 名、能力名、提案标题。
 *
 * 学生写下的一切走正文衬线，系统产出的一切走等宽。把「AI 参与」与「本人记录」
 * 在排版上分开，是项目「AI 不代写、不隐藏 AI 使用」这条原则的可视化，
 * 而不只是写在文档里。新增机器声文本一律用这个组件，别散手写 font-mono。
 */
export function Mono({ children, className, as: Tag = 'span' }: MonoProps) {
  return (
    <Tag className={cn('font-mono text-[0.8125em] tracking-tight tabular-nums', className)}>
      {children}
    </Tag>
  )
}
