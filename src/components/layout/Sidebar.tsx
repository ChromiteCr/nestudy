import { useLayoutEffect, useRef, useState } from 'react'
import { MessageSquare, MoreHorizontal, Puzzle, Settings, Waypoints } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Mono } from '@/components/ui/mono'
import { cn } from '@/lib/utils'
import { useBarPlugins } from '@/stores/pluginStore'
import type { AppView } from '@/types'
import { Logo } from './Logo'

interface SidebarProps {
  view: AppView
  onViewChange: (view: AppView) => void
}

/** RailItem 的高度（size-9 = 36px）加 gap-1（4px）。溢出计算按这个步长走 */
const ITEM_STEP = 40

/**
 * 56px 图标导轨。不做 240px 带文字的侧栏——画板要最大宽度，
 * 而核心目标少到不需要常驻文字标签。
 *
 * S10c 从三项加到四项（技能），当时写下的判断是「四项是上限」。
 * **S16a 推翻了那句话**，理由与代价记在 `types/index.ts` 的 `AppView` 上：
 * 核心项确实到顶了，但插件是用户自己开的，开了才占格、没开就不存在。
 *
 * 推翻它的代价就在这个文件里，**而且必须真的付**：
 * 装不下时要有溢出菜单（下面那段测量），顺序与上不上栏由插件管理页控制。
 * 少做溢出这一件，导轨就会在插件多的时候把「设置」挤出可视区——
 * 那正是原来那句话在防的事。
 */
export function Sidebar({ view, onViewChange }: SidebarProps) {
  const plugins = useBarPlugins()
  const slotsRef = useRef<HTMLDivElement>(null)
  const [slots, setSlots] = useState(Number.MAX_SAFE_INTEGER)

  // 量的是插件区自己的可用高度，不是窗口高度：核心项与设置各占多少
  // 是布局算出来的，在这里再算一遍就会和 CSS 各说各话
  const measure = () => {
    const el = slotsRef.current
    if (!el) return
    setSlots((prev) => {
      const next = Math.max(0, Math.floor(el.clientHeight / ITEM_STEP))
      // 值没变就返回原值，React 会跳过重渲染——所以「每次渲染后都量」不会成环
      return next === prev ? prev : next
    })
  }

  /*
    量两次，两次都需要：

    ① **每次渲染后**——插件增减、字体加载完、HMR 换了节点，都会改变可用高度，
       而这些变化本来就伴随一次渲染。
    ② ResizeObserver——改窗口大小不引起重渲染，只有它看得见。

    只留 ② 是不够的：**文档处于 hidden 时浏览器不跑渲染步骤，RO 一次都不会回调**
    （实测过，连 observe 时那次初始回调都没有）。标签页在后台时这无所谓，
    但 HMR 之后 ① 能当场自愈，而只靠 ② 会一直卡在旧值上。
  */
  useLayoutEffect(measure)

  useLayoutEffect(() => {
    const el = slotsRef.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure 每渲染重建，进依赖会让 RO 每次重新接线
  }, [])

  // 装不下时最后一格要让给 `⋯` 本身，否则菜单按钮自己会被挤掉
  const overflowing = plugins.length > slots
  const shown = overflowing ? plugins.slice(0, Math.max(0, slots - 1)) : plugins
  const hidden = overflowing ? plugins.slice(Math.max(0, slots - 1)) : []

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r bg-sidebar py-3 text-sidebar-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex size-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Logo className="size-7" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <Mono>学栖 nestudy</Mono>
        </TooltipContent>
      </Tooltip>

      <nav className="mt-6 flex flex-col gap-1">
        <RailItem
          icon={MessageSquare}
          label="聊天"
          active={view === 'chat'}
          onClick={() => onViewChange('chat')}
        />
        <RailItem
          icon={Waypoints}
          label="画板"
          active={view === 'canvas'}
          onClick={() => onViewChange('canvas')}
        />
        <RailItem
          icon={Puzzle}
          label="技能"
          active={view === 'skills'}
          onClick={() => onViewChange('skills')}
        />
      </nav>

      {/* 一根线把「应用自带的」和「你自己开的」分开。没有插件时不画——
          一条底下什么都没有的分隔线，读起来像是有东西没加载出来 */}
      {plugins.length > 0 && <div className="mt-2 h-px w-6 shrink-0 bg-sidebar-border" />}

      {/* 这一段吃掉全部剩余空间，它的高度就是插件区能用的高度 */}
      <div ref={slotsRef} className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-hidden">
        {shown.map((p) => (
          <RailItem
            key={p.id}
            icon={p.icon}
            label={p.name}
            active={view === `plugin:${p.id}`}
            onClick={() => onViewChange(`plugin:${p.id}`)}
          />
        ))}

        {hidden.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`还有 ${hidden.length} 个插件`}
                className="flex size-9 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <MoreHorizontal className="size-[18px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end">
              {hidden.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => onViewChange(`plugin:${p.id}`)}>
                  <p.icon className="size-4" />
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <RailItem
        icon={Settings}
        label="设置"
        active={view === 'settings'}
        onClick={() => onViewChange('settings')}
      />
    </aside>
  )
}

interface RailItemProps {
  icon: typeof MessageSquare
  label: string
  active: boolean
  onClick: () => void
}

function RailItem({ icon: Icon, label, active, onClick }: RailItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors',
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
          )}
        >
          <Icon className="size-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <Mono>{label}</Mono>
      </TooltipContent>
    </Tooltip>
  )
}
