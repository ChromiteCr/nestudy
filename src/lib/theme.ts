export interface ThemeColor {
  r: number
  g: number
  b: number
}

export const DEFAULT_THEME_HINT = '默认（苔绿）'

/**
 * 自选主色只写 signature，不碰 --primary/--sidebar-primary。
 *
 * 界面是无彩的，颜色留给学生的数据——所以这个色是「画板签名色」：
 * 只出现在画板与焦点态。以前它会把按钮、侧栏标记全刷一遍，
 * 那等于把界面的克制交给了一个取色器。
 */
const COLOR_VARS = ['--signature', '--ring', '--sidebar-ring']

export function applyThemeColor(color: ThemeColor | null): void {
  const root = document.documentElement
  if (!color) {
    for (const v of COLOR_VARS) root.style.removeProperty(v)
    return
  }
  const rgb = `rgb(${color.r} ${color.g} ${color.b})`
  for (const v of COLOR_VARS) root.style.setProperty(v, rgb)
}
