import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Mono } from '@/components/ui/mono'
import { depthOf } from '@/lib/engine/depth'
import { cn } from '@/lib/utils'
import { EVENT_CATEGORY_LABEL, type Artifact, type EventCategory, type GrowthEvent } from '@/types'
import { TONE_BAR } from './canvas-model'
import { buildTimeline, dayTicks, todayOffset, type TimelineModel } from './timeline-model'

/**
 * 时间线——画板的第二种看法。
 *
 * 画板看**关系**（谁影响了谁），这里看**疏密**（什么时候发生、持续多久、
 * 哪一段空着、哪些还开着口）。同一份数据、同一个类别筛选、同一个反思阅读器。
 *
 * **默认那一屏上「长到第几层」在结构上不存在**：`buildTimeline` 不接收 artifacts，
 * 所以 model 里算不出 depth。层只在悬停和点开时出现——那是他自己指的。
 * 理由见 `timeline-model.ts` 顶部与本文件 `depthOf` 的两个调用点。
 */

const LANE_LABEL_W = 60
const SPAN_ROW_H = 30
const POINT_ROW_H = 40
const HEADER_H = 42
/**
 * 最小缩放。旧值是 3，那是给「一学期」尺度定的。
 *
 * 今天的范围由数据极值定：短期事项的 status 恒为 pending、从不归档，
 * 历史上创建过的每一条都会落在轴上，800+ 天是常态。
 *
 * 定在 1.0 是被初始铺屏反过来逼出来的：一个高中生两年的跨度约 674 天，
 * 桌面可用宽约 876px，**要一屏装下就需要 1.3 px/天**。定在 1.6 时装不下，
 * 于是开轴就滚到最右，最早那两段经历连同标题一起被推到抽屉底下——
 * 打开一个「看疏密」的视图却只看到最近三个月，那是这一版第一次做出来的样子。
 */
const MIN_PPD = 1.0
const MAX_PPD = 32
const DEFAULT_PPD = 9
const DOT_R = 6
/** 卡片与被点项目之间的留白 */
const GAP = 8
/**
 * 卡片假定宽度，用于视口边界裁剪。**保持常量，不改成运行时测量**——
 * 它是 `clampAnchorX` 那道倒挂保护的输入，而卡片实际宽度是
 * `min(15rem, 100vw-4.5rem)`（≤240）。高估只会把卡片往左夹一点，是安全方向。
 */
const CARD_W = 240
/** 卡片假定高度上限，用于判断上方放不放得下（决定卡片朝上还是朝下展开） */
const ESTIMATED_CARD_H = 170
/**
 * 首次挂载时按**内容跨度**自适应缩放：他记下的第一件事到最后一件事，
 * 尽量一屏看完（留 12% 余量）。
 *
 * 早先按 `totalDays` 算并留 2.5 屏，结果是打开轴只看到最近几个月的一两条，
 * 更早的经历全在视口外——**而「哪一段空着」这件事，看不到全貌就根本读不出来**。
 * 一屏装不下（内容真的很长）时由 MIN_PPD 兜住，那时横滚是诚实的。
 */
const FIT_MARGIN = 1.12
/** 低于这个缩放就不画日刻度与竖网格线，只留月份表头 */
const TICK_PPD = 7

/**
 * 两个坐标系，**别合成一个**。数值恒等，来历不同。
 *
 * `laneX`：Lane 内部绝对定位子元素用。Lane 外壳是 `paddingLeft: LANE_LABEL_W`，
 * 而 `position:absolute` 的包含块是 **padding box**——`left:0` 对齐的是 border
 * 内沿，padding 不参与——所以子元素必须自己把这 60px 加回来。
 * **这是 S3f 修过的那个 bug**：刻度线和活动条错位整整一个学期。
 *
 * `canvasX`：画布级覆盖层（网格线、今日线、表头刻度、悬停标签、详情卡）用。
 * 外层画布没有 padding，但时间轴第 0 天的原点就在画布内 x = LANE_LABEL_W 处。
 *
 * 抽成一个的话，下一个人看到「同一个常量加了八遍」必然删错一半。
 */
const laneX = (px: number) => LANE_LABEL_W + px
const canvasX = (px: number) => LANE_LABEL_W + px

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * 根壳。**`top-12` 不是留白，是给左上那簇按钮让位。**
 *
 * 图模式下那簇按钮浮在画布上，画布是可拖动的空地，压住一点没关系；
 * 轴模式下它正好压在 sticky 表头（月份与日期刻度）那 42px 上，
 * 月份标签被盖住一半。让出这条带比给按钮加背景板干净——
 * 加背景板等于承认它盖住了东西。
 *
 * **`z-0` 不能省，也不能换成别的值**：position:absolute + z-index:auto 不建立
 * 层叠上下文，那样轴内部的 sticky 表头（z-20）会和那簇按钮在同一个上下文里比较。
 * z-0 建立上下文，把 0/10/20/30/40 这一整套关在轴内部。
 */
const SHELL = 'absolute inset-x-0 bottom-0 top-12 z-0'

type Selected =
  | { type: 'span'; id: string; anchorX: number; anchorY: number; growUp: boolean }
  | { type: 'day'; date: string; anchorX: number; anchorY: number; growUp: boolean }

interface Hovered {
  id: string
  x: number
  y: number
  below: boolean
}

export function TimelineView({
  growthEvents,
  artifacts,
  categoryFilter,
  onRead,
}: {
  growthEvents: GrowthEvent[]
  artifacts: Artifact[]
  categoryFilter: Set<EventCategory>
  /** 点开一份反思去读。和画板抽屉走同一个出口 */
  onRead: (artifactId: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ppd, setPpd] = useState(DEFAULT_PPD)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [hovered, setHovered] = useState<Hovered | null>(null)

  const model = useMemo(
    () => buildTimeline({ growthEvents, categoryFilter }),
    [growthEvents, categoryFilter],
  )

  const didFit = useRef(false)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || model.isEmpty || didFit.current) return
    didFit.current = true

    /*
      自适应初始缩放。范围由数据极值定、没有上限：三年 ≈ 1100 天，
      默认缩放 9 下就是 9900px——桌面 11 屏、窄屏 31 屏，
      「疏密」在那个缩放下根本读不出来。
      **只往下调，不往上**（上限仍是 DEFAULT_PPD）：数据少的时候范围有 90 天兜底，
      把缩放拉大只会让空轴显得更空。
    */
    const usable = el.clientWidth - LANE_LABEL_W
    const c = model.content
    // 按内容跨度定，不按 totalDays：totalDays 含 [今天−20, 今天+70] 的兜底，
    // 数据集中在两年前时那段兜底会白占三分之一的宽度
    const span = c ? Math.max(c.endDay - c.startDay, 1) : model.totalDays
    const fit = clamp(usable / (span * FIT_MARGIN), MIN_PPD, DEFAULT_PPD)
    setPpd(fit)

    /*
      锚点。**不无条件锚今天**：一次性补录两年前的旧经历时，所有内容都在轴的左端，
      锚今天等于让学生进轴先看到一屏空白，要往左滚六七屏才看到自己刚导入的东西。
      锚「离今天最近的有内容处」。
    */
    const t = todayOffset(model.rangeStart)
    /*
      内容一屏装得下就从内容起点开始铺（左边留一点余量），装不下才锚
      「离今天最近的有内容处」——**不无条件锚今天**：一次性补录两年前的旧经历时，
      锚今天等于让学生进轴先看到一屏空白，要往左滚六七屏才看到刚导入的东西。
    */
    const fitsOneScreen = c ? (c.endDay - c.startDay) * fit <= usable : true
    const focusDay = fitsOneScreen
      ? (c?.startDay ?? t)
      : c
        ? Math.min(Math.max(t, c.startDay), c.endDay)
        : t
    // 缩放由 state 驱动，同 tick 内 scrollWidth 还是旧的——和 setZoom 同一个坑
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, focusDay * fit - (fitsOneScreen ? 24 : el.clientWidth * 0.4))
    })
  }, [model])

  const setZoom = (next: number, anchorClientX?: number) => {
    const el = scrollRef.current
    setSelected(null)
    setHovered(null) // 鼠标还压在条上，但坐标已经失效了
    if (!el) return setPpd(next)
    const rect = el.getBoundingClientRect()
    const cx = (anchorClientX ?? rect.left + rect.width / 2) - rect.left + el.scrollLeft - LANE_LABEL_W
    const dayAt = cx / ppd
    setPpd(next)
    /*
      **这个 requestAnimationFrame 不是动画，删不得。**
      画布宽度 = totalDays × ppd 由 state 驱动，新宽度要等 commit 之后才生效；
      在同一 tick 里写 scrollLeft 会被浏览器夹到**旧的**（更小的）scrollWidth 上。
      症状是「放大之后视口莫名跳回左边」，而且只在往右滚过之后才复现——
      很难在开发时撞见，容易当成偶发。

      两侧的 `- LANE_LABEL_W` 是同一个原点偏移的正反运算：光标 X → 内容 X →
      减掉标签沟槽 → 纯日轴像素 → ÷ppd = 光标下的那一天；放大后再反解回去，
      保证那一天仍在光标底下。删任一边那一天就飞了。
    */
    requestAnimationFrame(() => {
      el.scrollLeft = dayAt * next - ((anchorClientX ?? rect.left + rect.width / 2) - rect.left - LANE_LABEL_W)
    })
  }

  /** 卡片水平位置裁剪到当前可视滚动窗口内，避免超出屏幕 */
  const clampAnchorX = (rawX: number): number => {
    const el = scrollRef.current
    if (!el) return rawX
    const viewLeft = el.scrollLeft + LANE_LABEL_W + 4
    const viewRight = el.scrollLeft + el.clientWidth - CARD_W - 4
    /*
      **`Math.max(viewLeft, viewRight)` 不能删。** 下面的 clamp 是
      `Math.min(hi, Math.max(lo, v))`，在 hi < lo 时返回 hi，也就是把详情卡塞到
      泳道标签沟槽左边。触发条件是可视宽 < 60 + 240 + 8 = 308px；
      轴嵌在画板里、md 以上左边还有 288px 的抽屉，比它当初独占整页时更容易撞到。

      两个边界都是**内容坐标不是视口坐标**，所以都要 + scrollLeft——
      这也是它必须在事件里读 scrollRef.current、不能预先算好的原因。
    */
    return clamp(rawX, viewLeft, Math.max(viewLeft, viewRight))
  }

  /** 上方放不下就朝下展开。贴着表头的那几行属于这一类 */
  const hasRoomAbove = (topY: number): boolean => {
    const el = scrollRef.current
    if (!el) return true
    return topY - el.scrollTop > ESTIMATED_CARD_H
  }

  const spanLaneH = model.spanRows * SPAN_ROW_H + 8
  const pointLaneTop = HEADER_H + spanLaneH
  const width = model.totalDays * ppd
  const showTicks = ppd >= TICK_PPD
  const ticks = useMemo(
    () => (showTicks ? dayTicks(model.rangeStart, model.totalDays, ppd) : []),
    [showTicks, model.rangeStart, model.totalDays, ppd],
  )
  const tOffset = todayOffset(model.rangeStart)

  const hoveredEvent = hovered ? growthEvents.find((e) => e.id === hovered.id) : undefined
  const hoveredDepth = useMemo(
    () => (hoveredEvent ? depthOf(hoveredEvent, artifacts) : null),
    [hoveredEvent, artifacts],
  )

  const footer = <Footer model={model} filterCount={categoryFilter.size} />

  if (model.isEmpty) {
    /*
      空态**不渲染画布**。否则学生看到的是一张已经画好月份标签、日期刻度和
      竖网格线的空坐标纸——按项目自己那句「一排等着被填的空位本身就是在催他」，
      那比一片空白更催。缩放控件也不渲染：没有东西可缩放。
    */
    return (
      <div className={cn(SHELL, 'flex min-h-0 flex-col')}>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <p className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            {model.hiddenByFilter > 0
              ? '当前筛选下没有可显示的事项。'
              : '还没有带日期的事项。在聊天里记下你在做的事，这里会按时间摊开。'}
          </p>
        </div>
        {footer}
      </div>
    )
  }

  return (
    /*
      根用 absolute inset-0 把高度直接钉在画布列上：父级是 `relative min-w-0 flex-1`，
      没有 flex-col 也没有 min-h-0，普通的 flex 高度链在这里接不上。

      **`z-0` 不能省，也不能换成别的值**：position:absolute + z-index:auto 不建立
      层叠上下文，那样轴内部的 sticky 表头（z-20）会和 CanvasView 左上那簇按钮
      在同一个上下文里比较，把切换器盖住。z-0 建立上下文，把 0/10/20/30/40
      这一整套关在轴内部。
    */
    <div className={cn(SHELL, 'flex min-h-0 flex-col')}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          className="flex h-full flex-col overflow-auto"
          /*
            两条泳道在一块几百像素高的空地上顶着天花板，看起来像半截东西而不是一个视图。
            内容比视口矮时居中；比视口高时 `safe` 关键字保证退回顶对齐，
            **不会把顶部挤出滚动区**（那是 flex 居中在溢出时的经典坑：
            内容两头等量溢出，向上那半永远滚不回来）。
            浏览器不认 `safe` 就整条声明作废，退化成顶对齐，也就是不居中而已。
          */
          style={{ justifyContent: 'safe center' }}
          onWheel={(e) => {
            // 只拦 ⌘/Ctrl+滚轮，普通滚轮留给页面
            if (!e.ctrlKey && !e.metaKey) return
            e.preventDefault()
            setZoom(clamp(ppd * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN_PPD, MAX_PPD), e.clientX)
          }}
        >
          <div
            className="relative shrink-0"
            style={{ width: width + LANE_LABEL_W, minWidth: '100%' }}
            onClick={() => setSelected(null)}
          >
            {/* 表头：月份 + 日期刻度 */}
            <div
              className="sticky top-0 z-20 border-b bg-background"
              style={{ height: HEADER_H, paddingLeft: LANE_LABEL_W }}
            >
              {model.months.map((m, i) => {
                const boxW = m.days * ppd
                /*
                  **按可用宽度降级，而且必须 nowrap。** 缩到低倍时一个月只有 48px，
                  而「2024年9月」在这个字号下要 60px——不降级就换行，
                  标签盒撑到 57px 高、越过 42px 的表头**压到下面的经历条上**，
                  看起来就是「时间轴自己重叠了」。这是本视图第一版真实踩到的坑。
                */
                const label = boxW >= 68 ? m.label : boxW >= 30 ? m.short : ''
                return (
                  <div
                    key={i}
                    className="absolute top-0 overflow-hidden border-l pl-1 pt-1"
                    style={{ left: canvasX(m.startDay * ppd), width: boxW }}
                  >
                    <Mono className="whitespace-nowrap text-muted-foreground">{label}</Mono>
                  </div>
                )
              })}
              {showTicks &&
                ticks.map((t, i) => (
                  <div
                    key={i}
                    className="absolute bottom-0 flex flex-col items-start"
                    style={{ left: canvasX(t.offset * ppd) }}
                  >
                    <Mono className="pl-0.5 text-[11px] text-muted-foreground">{t.label}</Mono>
                  </div>
                ))}
            </div>

            {/* 竖网格线。z-0，压在条下面 */}
            {showTicks &&
              ticks.map((t, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute bottom-0 z-0 w-px bg-border/50"
                  style={{ left: canvasX(t.offset * ppd), top: HEADER_H }}
                />
              ))}

            {/* 今日线 */}
            <div
              className="pointer-events-none absolute bottom-0 z-10 w-px bg-signature/70"
              style={{ left: canvasX(tOffset * ppd), top: HEADER_H - 14 }}
            >
              <Mono className="absolute -top-3.5 left-1 text-[11px] text-signature">今天</Mono>
            </div>

            <Lane label="经历" heightPx={spanLaneH}>
              {model.spans.map((s) => {
                const left = Math.max(s.startDay * ppd, 0)
                const right = s.endDay * ppd
                // 单日经历宽 0、不可点；低缩放下两天也才 3px
                const barWidth = Math.max(right - left, 8)
                const barTop = s.row * SPAN_ROW_H + 4
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={cn(
                      'absolute flex h-6 items-center overflow-hidden rounded-sm border bg-card text-left',
                      'hover:ring-1 hover:ring-signature focus-visible:ring-1 focus-visible:ring-signature',
                      selected?.type === 'span' && selected.id === s.id && 'ring-1 ring-signature',
                    )}
                    style={{
                      left: laneX(left),
                      width: barWidth,
                      top: barTop,
                      /*
                        进行中：右端渐隐。**这是外部事实，不是评价。**
                        不用整条变淡有两个理由：一是把透明度这条通道彻底腾空，
                        不留任何人拿它编码「长到第几层」的余地；二是没有结束日期的条
                        一路铺到范围右端，而范围右端是「数据极值 + 一个月」，
                        整条变淡看起来像「在那天结束了」，渐隐才是「看不到尽头」。
                        这个标记不能省——「哪一段空着」的读法依赖于分得清
                        开着口的条和闭合的条。
                      */
                      ...(s.end === null && {
                        maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)',
                        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)',
                      }),
                    }}
                    onMouseEnter={(e) => {
                      const el = scrollRef.current
                      if (!el) return
                      const x = e.clientX - el.getBoundingClientRect().left + el.scrollLeft
                      const y = HEADER_H + barTop
                      setHovered({ id: s.id, x: clampAnchorX(x), y, below: s.row === 0 })
                    }}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(e) => {
                      e.stopPropagation() // 外壳挂着关卡 handler，删掉就是「点开的瞬间自己关掉」
                      /*
                        用点击位置而非条形的真实右端定位——不然跨度很长（比如进行中的
                        经历）时，锚点会落在时间轴的最右端，和实际点击处相差十万八千里。
                        根源在上面 `right = s.endDay * ppd`：没有结束日期的条 endDay
                        就是 totalDays，一路铺到画布最右。**这是 S3f 修过的那个 bug。**
                      */
                      const el = scrollRef.current
                      const clickX = el
                        ? e.clientX - el.getBoundingClientRect().left + el.scrollLeft
                        : laneX(left)
                      const barTopY = HEADER_H + barTop
                      const growUp = hasRoomAbove(barTopY)
                      setSelected({
                        type: 'span',
                        id: s.id,
                        anchorX: clampAnchorX(clickX + GAP),
                        anchorY: growUp ? barTopY - GAP : barTopY + 24 + GAP,
                        growUp,
                      })
                    }}
                  >
                    {/* 颜色只出现在左侧这 3px，和画板节点卡完全同形。
                        **不做实色填充**：一排实色长条并排就是条形图读法，
                        而条形图读法是把打分表引进来最省事的一条路 */}
                    <span className={cn('h-full w-[3px] shrink-0', TONE_BAR[s.tone])} />
                    <span className="truncate px-1.5 text-xs">{s.title}</span>
                  </button>
                )
              })}
            </Lane>

            <Lane label="事项" heightPx={POINT_ROW_H}>
              {model.days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full p-1"
                  style={{ left: laneX(d.day * ppd) }}
                  onClick={(e) => {
                    e.stopPropagation()
                    const el = scrollRef.current
                    const clickX = el
                      ? e.clientX - el.getBoundingClientRect().left + el.scrollLeft
                      : laneX(d.day * ppd)
                    const cy = pointLaneTop + POINT_ROW_H / 2
                    const growUp = hasRoomAbove(cy)
                    setSelected({
                      type: 'day',
                      date: d.date,
                      anchorX: clampAnchorX(clickX + GAP),
                      anchorY: growUp ? cy - DOT_R - GAP : cy + DOT_R + GAP,
                      growUp,
                    })
                  }}
                >
                  {/* 当天多于一条走无彩：一天里挤了三件事，用其中任意一件的类别色都是撒谎。
                      **点上不写数字**——写个「3」就成了计数 */}
                  <span
                    className={cn(
                      'block rounded-full ring-2 ring-background',
                      d.tone ? TONE_BAR[d.tone] : 'bg-muted-foreground/40',
                    )}
                    style={{ width: DOT_R * 2, height: DOT_R * 2 }}
                  />
                </button>
              ))}
            </Lane>

            {/*
              悬停时露一行「长到第几层」。**这是 depthOf 的第一个调用点，
              而它在 hovered !== null 分支里**——默认那一屏上零调用。

              口径抄的是画板抽屉那一行，一个字不改。它做对了三件事：
              ① 信息全在 `d.label` 这个字符串里，把 className 全删掉这一行仍然完整可读，
                 视觉编码只跟随一句已经写出来的陈述句，从不独立承载信息；
              ② 三层只有**两种**视觉状态，而且加重的那一档是恢复常态而不是高亮色——
                 「到位了就该安静」是正向表述，到位的那一端在视觉上必须是最不显眼的；
              ③ 第一层和第二层长得一模一样，梯度被刻意压平。

              为什么是悬停不是常驻：一排常驻的层标签比空位更糟，
              那是把空位填上了一个写着「你这段只有履历」的牌子。
            */}
            {hovered && hoveredDepth && (
              <div
                className="pointer-events-none absolute z-30 rounded-sm border bg-popover px-1.5 py-0.5 shadow-sm"
                style={{ left: hovered.x, top: hovered.y + (hovered.below ? 26 : -22) }}
              >
                <Mono className={cn('text-muted-foreground', hoveredDepth.depth === 3 && 'text-foreground')}>
                  {hoveredDepth.label}
                </Mono>
              </div>
            )}

            {selected && (
              <TimelineCard
                selected={selected}
                model={model}
                growthEvents={growthEvents}
                artifacts={artifacts}
                onRead={onRead}
                onClose={() => setSelected(null)}
              />
            )}
          </div>
        </div>

        {/* 缩放挂在滚动区的**包裹层**上：挂滚动元素里会跟着滚走，挂根上会压到 footer。
            左下正好是图模式里 Controls 的位置——「缩放永远在左下」跨两个视图成立。
            触屏没有 ⌘+滚轮，所以这对按钮在窄屏也必须在 */}
        <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-sm border bg-card">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-none"
            aria-label="放大"
            onClick={() => setZoom(clamp(ppd * 1.4, MIN_PPD, MAX_PPD))}
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-none border-t"
            aria-label="缩小"
            onClick={() => setZoom(clamp(ppd / 1.4, MIN_PPD, MAX_PPD))}
          >
            <Minus className="size-3.5" />
          </Button>
        </div>
      </div>
      {footer}
    </div>
  )
}

/**
 * 两句显示口径陈述。
 *
 * 第一句**必需**：类别筛选和画板共用，但语义有差——画板上滤掉一类只是少几张卡，
 * **轴上滤掉一类会留下一段时间的空白，而「哪一段空着」正是这个视图要被读出来的东西**。
 * 筛选控件在抽屉里而抽屉可以收起，所以轴自己必须说这一句，否则时间轴会撒谎。
 *
 * 两句都是关于**显示状态**的，不是关于他的判断。两个条件都不成立就整行不渲染。
 */
function Footer({ model, filterCount }: { model: TimelineModel; filterCount: number }) {
  if (model.hiddenByFilter === 0 && model.undatedLong === 0) return null
  return (
    <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-0.5 border-t px-3 py-1.5">
      {model.hiddenByFilter > 0 && (
        <Mono className="text-muted-foreground">
          正在按 {filterCount} 个类别筛选，另有 {model.hiddenByFilter} 件不在轴上
        </Mono>
      )}
      {model.undatedLong > 0 && (
        <Mono className="text-muted-foreground">另有 {model.undatedLong} 段经历没有日期，不在轴上</Mono>
      )}
    </div>
  )
}

/**
 * 点开一段经历或某一天。
 *
 * 经历卡自上而下：标题 → 起止 → 类别 → 长到第几层 → 他写下的「下次会怎么做」→
 * 关联的反思。**后两块有内容才占地方**：没有的时候卡片就短一截，
 * 不留空槽、不写「待补充」、不画虚线框——空着不是缺陷，不该被分配像素。
 *
 * 关联反思那一行是「哪些事做过却没长出东西」在界面上唯一正当的出口：
 * **它不是一个提示他没写的记号，是一个通往他写过的东西的门。**
 */
function TimelineCard({
  selected,
  model,
  growthEvents,
  artifacts,
  onRead,
  onClose,
}: {
  selected: Selected
  model: TimelineModel
  growthEvents: GrowthEvent[]
  artifacts: Artifact[]
  onRead: (artifactId: string) => void
  onClose: () => void
}) {
  const shell = cn(
    'absolute z-40 w-[min(15rem,calc(100vw-4.5rem))] rounded-sm border bg-popover p-2.5 shadow-md',
    selected.growUp && '-translate-y-full',
  )
  const style = { left: selected.anchorX, top: selected.anchorY }

  if (selected.type === 'day') {
    const day = model.days.find((d) => d.date === selected.date)
    if (!day) return null
    return (
      <div className={shell} style={style} onClick={(e) => e.stopPropagation()}>
        <Mono className="mb-1.5 block text-muted-foreground">{day.date}</Mono>
        <div className="flex flex-col gap-1.5">
          {day.events.map((ev) => (
            <div key={ev.id} className="flex items-start gap-1.5">
              <span className={cn('mt-1 h-3 w-[3px] shrink-0 rounded-sm', TONE_BAR[ev.tone])} />
              <div className="min-w-0">
                <p className="truncate text-sm leading-snug">{ev.title}</p>
                <Mono className="text-muted-foreground">
                  {EVENT_CATEGORY_LABEL[ev.category]}
                  {ev.parentTitle && ` · 属于 ${ev.parentTitle}`}
                </Mono>
              </div>
            </div>
          ))}
        </div>
        <CloseRow onClose={onClose} />
      </div>
    )
  }

  const event = growthEvents.find((e) => e.id === selected.id)
  if (!event) return null
  // depthOf 的第二个、也是最后一个调用点，同样在「他自己点开了」这个分支里
  const d = depthOf(event, artifacts)
  const linked = artifacts.filter(
    (a) => a.kind === 'reflection' && a.linkedNodeIds.includes(`event:${event.id}`),
  )

  return (
    <div className={shell} style={style} onClick={(e) => e.stopPropagation()}>
      <p className="text-sm font-medium leading-snug">{event.title}</p>
      <Mono className="mt-0.5 block text-muted-foreground">
        {event.startDate} → {event.endDate ?? ''}
      </Mono>
      <Mono className="mt-0.5 block text-muted-foreground">{EVENT_CATEGORY_LABEL[event.category]}</Mono>
      <Mono className={cn('mt-1 block text-muted-foreground', d.depth === 3 && 'text-foreground')}>
        {d.label}
      </Mono>

      {d.takeaway && (
        <div className="mt-2 border-t pt-2">
          {/* 小标签走等宽（系统的），内容走正文（他的）。**绝不给原话套等宽**——
              那会把他说的话渲染成机器声 */}
          <Mono className="mb-0.5 block text-muted-foreground">下次会怎么做</Mono>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{d.takeaway}</p>
        </div>
      )}

      {linked.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5 border-t pt-2">
          {linked.map((a) => (
            <button
              key={a.id}
              type="button"
              className="truncate rounded-sm px-1 py-0.5 text-left text-sm hover:bg-accent/60"
              onClick={() => onRead(a.id)}
            >
              {a.title}
            </button>
          ))}
        </div>
      )}
      <CloseRow onClose={onClose} />
    </div>
  )
}

function CloseRow({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      className="mt-2 w-full rounded-sm border px-2 py-1 text-xs text-muted-foreground hover:bg-accent/60"
      onClick={onClose}
    >
      关闭
    </button>
  )
}

function Lane({
  label,
  heightPx,
  children,
}: {
  label: string
  heightPx: number
  children: React.ReactNode
}) {
  return (
    <div className="relative border-b" style={{ height: heightPx, paddingLeft: LANE_LABEL_W }}>
      {/*
        四个约束拧成一个结，改任一个都退化，退化方式还各不相同：
        - `sticky` 而非 `absolute`：横向滚动时标签要钉在左边，absolute 不参与 sticky
        - `float-left`：sticky 要求元素留在正常流内；float 保住流内身份又不占行盒宽度
        - `marginLeft: -LANE_LABEL_W` 配父级 paddingLeft：把标签拉回左侧沟槽，
          内容区起点仍是 x=60；去掉它内容被顶掉 60px
        - `z-20`：条和圆点在同一层叠上下文里，没有它横向滚动时条会画在标签上面
      */}
      <div
        className="sticky left-0 z-20 float-left flex h-full items-center border-r bg-background pr-1 text-xs font-medium text-muted-foreground"
        style={{ width: LANE_LABEL_W, marginLeft: -LANE_LABEL_W }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
