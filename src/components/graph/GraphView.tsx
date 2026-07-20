import { useEffect, useMemo, useRef, useState } from 'react'
import { Network, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { useChatStore } from '@/stores/chatStore'
import { buildSphereNodes, projectNodes, type ProjectedNode } from './sphere-model'
import type { AppView, NarrativeEdge } from '@/types'

const NARRATIVE_PROMPT =
  '请用 get_activities 和 get_profile 了解我的活动、课程和目标学校，然后在同一轮里直接调用 propose_narrative 给出叙事线连接——哪些经历串成一条以个人成长为中心、最终指向申请目标的故事，每条连接说明为什么连。不要停下来只做说明或反问，读完数据就出提案卡。'

interface GraphViewProps {
  onNavigate: (view: AppView) => void
}

/** 成长星图：可旋转/缩放的 3D 球体，中心为专业方向，向外为核心/次要活动与课程，叙事线为弧线边 */
export function GraphView({ onNavigate }: GraphViewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)
  const narrativeEdges = usePlanningStore((s) => s.narrativeEdges)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  const nodes = useMemo(() => buildSphereNodes(activities, profile), [activities, profile])
  const isEmpty = nodes.length === 0

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [rot, setRot] = useState({ x: -0.35, y: 0.5 })
  const [zoom, setZoom] = useState(1)
  const dragging = useRef<{ x: number; y: number } | null>(null)
  const autoRef = useRef(true)

  // 尺寸自适应
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [isEmpty])

  // 空闲缓慢自转（拖动时暂停）
  useEffect(() => {
    if (isEmpty) return
    let raf = 0
    const tick = () => {
      if (autoRef.current && !dragging.current) {
        setRot((r) => ({ ...r, y: r.y + 0.0015 }))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isEmpty])

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY }
    autoRef.current = false
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragging.current.x
    const dy = e.clientY - dragging.current.y
    dragging.current = { x: e.clientX, y: e.clientY }
    setRot((r) => ({ x: clamp(r.x + dy * 0.006, -1.4, 1.4), y: r.y + dx * 0.006 }))
  }
  const onPointerUp = () => {
    dragging.current = null
  }
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 0.9), 0.5, 2.6))
  }

  const cx = size.w / 2
  const cy = size.h / 2
  const projected = useMemo(
    () => projectNodes(nodes, rot.x, rot.y, zoom, cx, cy),
    [nodes, rot.x, rot.y, zoom, cx, cy],
  )
  const posById = useMemo(() => {
    const m = new Map<string, ProjectedNode>()
    for (const p of projected) m.set(p.id, p)
    return m
  }, [projected])

  const askNarrative = () => {
    setPendingPrompt(NARRATIVE_PROMPT)
    onNavigate('chat')
  }
  const reset = () => {
    setRot({ x: -0.35, y: 0.5 })
    setZoom(1)
    autoRef.current = true
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">成果网络</h1>
          <p className="text-sm text-muted-foreground">成长星图 · 拖动旋转 · 滚轮缩放</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="size-7" aria-label="重置视角" onClick={reset}>
            <RotateCcw className="size-3.5" />
          </Button>
          <Button size="sm" className="gap-1.5" onClick={askNarrative} disabled={activities.length < 2}>
            <Sparkles className="size-3.5" />
            AI 梳理叙事线
          </Button>
        </div>
      </header>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <Network className="size-6 text-muted-foreground" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            星图还是空的。先在「活动」里添加课外活动，或建立档案填入课程与目标专业，
            它们会作为星点出现在这里。
          </p>
          <Button size="sm" variant="outline" onClick={() => onNavigate('activities')}>
            去添加活动
          </Button>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1a2036_0%,_#0a0e1a_70%)]"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onWheel={onWheel}
        >
          <svg width={size.w} height={size.h} className="absolute inset-0 cursor-grab active:cursor-grabbing">
            {/* 弧线边（先渲染，位于星点下方） */}
            <g>
              {narrativeEdges.map((e) => (
                <EdgeArc key={e.id} edge={e} posById={posById} cx={cx} cy={cy} />
              ))}
            </g>
            {/* 星点（后到前） */}
            {projected.map((p) => (
              <StarNode key={p.id} node={p} />
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}

function EdgeArc({
  edge,
  posById,
  cx,
  cy,
}: {
  edge: NarrativeEdge
  posById: Map<string, ProjectedNode>
  cx: number
  cy: number
}) {
  const a = posById.get(edge.sourceNodeId)
  const b = posById.get(edge.targetNodeId)
  if (!a || !b) return null
  const mx = (a.sx + b.sx) / 2
  const my = (a.sy + b.sy) / 2
  // 控制点从画布中心向外推，形成弧
  const ox = mx - cx
  const oy = my - cy
  const k = 0.25
  const ctrlX = mx + ox * k
  const ctrlY = my + oy * k
  const opacity = 0.15 + ((a.t + b.t) / 2) * 0.5
  return (
    <path
      d={`M ${a.sx} ${a.sy} Q ${ctrlX} ${ctrlY} ${b.sx} ${b.sy}`}
      fill="none"
      stroke="#8aa0d0"
      strokeWidth={1}
      strokeOpacity={opacity}
    />
  )
}

function StarNode({ node }: { node: ProjectedNode }) {
  const showLabel = node.kind === 'major' || node.radius > 13
  return (
    <g style={{ opacity: node.opacity }}>
      {/* 光晕 */}
      <circle cx={node.sx} cy={node.sy} r={node.radius * 1.9} fill={node.color} opacity={0.14} />
      <circle
        cx={node.sx}
        cy={node.sy}
        r={node.radius}
        style={{ fill: node.color }}
        stroke="#ffffff"
        strokeOpacity={node.kind === 'major' ? 0.9 : 0.35}
        strokeWidth={node.kind === 'major' ? 1.5 : 0.75}
      />
      {showLabel && (
        <text
          x={node.sx}
          y={node.sy + node.radius + 11}
          textAnchor="middle"
          fontSize={node.kind === 'major' ? 12 : 10}
          fill="#e8edf7"
          style={{ pointerEvents: 'none' }}
        >
          {node.label.length > 12 ? node.label.slice(0, 12) + '…' : node.label}
        </text>
      )}
    </g>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
