import * as React from 'react'

import { cn } from '@/lib/utils'

interface FieldShellProps {
  id: string
  label: string
  hint?: React.ReactNode
  size?: 'default' | 'sm'
  multiline?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * 描边 + 浮起标签的输入框。样式全在 index.css 的 `.field` 那一段，
 * 这里只负责把三层拼起来：真正的控件、看得见的那个标签、以及用来在描边上
 * 开缺口的 fieldset。
 *
 * legend 里再写一遍标签文字是必须的：缺口的宽度由它撑开，而它本身不可见。
 * 两处文字必须一致，否则缺口会比字宽或窄一截。
 */
function FieldShell({ id, label, hint, size, multiline, className, children }: FieldShellProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="field" data-size={size} data-multiline={multiline ? '' : undefined}>
        {children}
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        <fieldset className="field-outline" aria-hidden="true">
          <legend>
            <span>{label}</span>
          </legend>
        </fieldset>
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

interface TextFieldProps extends Omit<React.ComponentProps<'input'>, 'placeholder' | 'size'> {
  /** 兼任占位符：空着的时候它就坐在框里 */
  label: string
  /** 框下面那行脚注。真要交代的事写这儿，别塞进标签 */
  hint?: React.ReactNode
  size?: 'default' | 'sm'
  /** 落在最外层那一列上（宽度、外边距），className 仍然给控件本身 */
  wrapClassName?: string
}

/**
 * 占位符被写成一个空格：`:placeholder-shown` 是「这一格空着吗」唯一不用
 * 受控 value 就能问到的地方，标签浮不浮起来全看它。真的占位文字在 CSS 里被涂透明——
 * 标签已经在那儿了，再垫一层灰字就是同一句话说两遍。
 */
function TextField({ label, hint, size, wrapClassName, className, id, ...props }: TextFieldProps) {
  const generated = React.useId()
  const fieldId = id ?? generated

  return (
    <FieldShell id={fieldId} label={label} hint={hint} size={size} className={wrapClassName}>
      <input id={fieldId} placeholder=" " className={cn('field-control', className)} {...props} />
    </FieldShell>
  )
}

interface TextAreaProps extends Omit<React.ComponentProps<'textarea'>, 'placeholder'> {
  label: string
  hint?: React.ReactNode
  wrapClassName?: string
}

function TextArea({ label, hint, wrapClassName, className, id, ...props }: TextAreaProps) {
  const generated = React.useId()
  const fieldId = id ?? generated

  return (
    <FieldShell id={fieldId} label={label} hint={hint} multiline className={wrapClassName}>
      <textarea
        id={fieldId}
        placeholder=" "
        data-multiline=""
        className={cn('field-control', className)}
        {...props}
      />
    </FieldShell>
  )
}

export { TextField, TextArea }
