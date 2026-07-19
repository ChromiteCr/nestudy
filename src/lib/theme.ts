export interface ThemeColor {
  r: number
  g: number
  b: number
}

export const DEFAULT_THEME_HINT = '默认（黑）'

const COLOR_VARS = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring']
const FG_VARS = ['--primary-foreground', '--sidebar-primary-foreground']

/** 把用户选的主色写入 CSS 变量；null 恢复主题默认 */
export function applyThemeColor(color: ThemeColor | null): void {
  const root = document.documentElement
  if (!color) {
    for (const v of [...COLOR_VARS, ...FG_VARS]) root.style.removeProperty(v)
    return
  }
  const rgb = `rgb(${color.r} ${color.g} ${color.b})`
  for (const v of COLOR_VARS) root.style.setProperty(v, rgb)
  // 按亮度选前景色，保证按钮文字可读
  const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255
  const fg = luminance > 0.6 ? '#1c1c1c' : '#ffffff'
  for (const v of FG_VARS) root.style.setProperty(v, fg)
}
