import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { List, Loader2, Network, Plus, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePlanningStore } from '@/stores/planningStore'
import { useChatStore } from '@/stores/chatStore'
import {
  activeOrbitRadii,
  buildSphereNodes,
  DEFAULT_TILT,
  effectiveMajors,
  projectNodes,
  type ProjectedNode,
} from './sphere-model'
import { suggestShells } from '@/lib/ai/graph-ai'
import { NodeCard, EdgeCard } from './StarCard'
import { NodeListPanel } from './NodeListPanel'
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
  const graphMeta = usePlanningStore((s) => s.graphMeta)
  const updateProfile = usePlanningStore((s) => s.updateProfile)
  const setNodeMeta = usePlanningStore((s) => s.setNodeMeta)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  const shellOverride = useMemo(() => {
    const o: Record<string, number> = {}
    for (const [id, m] of Object.entries(graphMeta)) if (m.shell !== undefined) o[id] = m.shell
    return o
  }, [graphMeta])
  const nodes = useMemo(() => buildSphereNodes(activities, profile, shellOverride), [activities, profile, shellOverride])
  const isEmpty = nodes.length === 0

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [rot, setRot] = useState({ x: DEFAULT_TILT, y: 0.4 })
  const [zoom, setZoom] = useState(1)
  const dragging = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  const [selected, setSelected] = useState<{ type: 'node' | 'edge'; id: string } | null>(null)
  const [layouting, setLayouting] = useState(false)
  const [addingMajor, setAddingMajor] = useState(false)
  const [majorDraft, setMajorDraft] = useState('')
  const [listOpen, setListOpen] = useState(false)

  // 尺寸自适应
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [isEmpty])

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { x: e.clientX, y: e.clientY }
    moved.current = false
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragging.current.x
    const dy = e.clientY - dragging.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved.current = true
    dragging.current = { x: e.clientX, y: e.clientY }
    // 水平拖动=绕轨道系旋转；竖直拖动=调整俯视倾角（限制在俯视区间，避免眩晕的翻转）
    setRot((r) => ({ x: clamp(r.x + dy * 0.005, -1.35, -0.25), y: r.y + dx * 0.006 }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    dragging.current = null
    if (moved.current) return
    // 未拖动 = 点击：命中前景未遮挡的星点或边
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    setSelected(hitTest(px, py))
  }

  /** 命中检测：优先取包含光标、深度最大（最前）的星点；否则取最近的边 */
  const hitTest = (px: number, py: number): { type: 'node' | 'edge'; id: string } | null => {
    let bestNode: ProjectedNode | null = null
    for (const p of projected) {
      const d = Math.hypot(p.sx - px, p.sy - py)
      if (d <= p.radius + 3 && (!bestNode || p.depth > bestNode.depth)) bestNode = p
    }
    if (bestNode) return { type: 'node', id: bestNode.id }

    let bestEdge: { id: string; dist: number } | null = null
    for (const edge of narrativeEdges) {
      const a = posById.get(edge.sourceNodeId)
      const b = posById.get(edge.targetNodeId)
      if (!a || !b) continue
      // 沿实际二次贝塞尔曲线采样（与 EdgeArc 的控制点一致）
      const [ctrlX, ctrlY] = edgeControl(a, b, cx, cy)
      for (let t = 0.1; t <= 0.9; t += 0.08) {
        const mt = 1 - t
        const x = mt * mt * a.sx + 2 * mt * t * ctrlX + t * t * b.sx
        const y = mt * mt * a.sy + 2 * mt * t * ctrlY + t * t * b.sy
        const dist = Math.hypot(x - px, y - py)
        if (dist < 11 && (!bestEdge || dist < bestEdge.dist)) bestEdge = { id: edge.id, dist }
      }
    }
    return bestEdge ? { type: 'edge', id: bestEdge.id } : null
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

  // 轨道环椭圆（rotY 不改变环形，仅倾角决定椭圆扁率）
  const orbitRadii = useMemo(() => activeOrbitRadii(nodes), [nodes])
  const ryFactor = Math.abs(Math.sin(rot.x))

  // 每个非中心节点连到最近的专业方向（归属线）
  const affiliations = useMemo(() => {
    const majors = projected.filter((p) => p.kind === 'major')
    if (majors.length === 0) return []
    return projected
      .filter((p) => p.kind !== 'major')
      .map((p) => {
        let nearest = majors[0]
        let best = Infinity
        for (const m of majors) {
          const d = Math.hypot(m.sx - p.sx, m.sy - p.sy)
          if (d < best) {
            best = d
            nearest = m
          }
        }
        return { id: p.id, from: p, to: nearest }
      })
  }, [projected])

  const askNarrative = () => {
    setPendingPrompt(NARRATIVE_PROMPT)
    onNavigate('chat')
  }
  const reset = () => {
    setRot({ x: DEFAULT_TILT, y: 0.4 })
    setZoom(1)
    setSelected(null)
  }

  const runAiLayout = async () => {
    setLayouting(true)
    try {
      const items = nodes
        .filter((n) => n.kind !== 'major')
        .map((n) => ({ id: n.id, label: n.label, kind: n.kind }))
      const byLabel = await suggestShells(
        items.map((it) => ({ label: it.label, kind: it.kind })),
        effectiveMajors(profile),
      )
      // 容错匹配：AI 回显的标题可能与原标题略有出入
      const keys = Object.keys(byLabel)
      let applied = 0
      for (const it of items) {
        const key =
          keys.find((k) => k === it.label) ??
          keys.find((k) => k.includes(it.label) || it.label.includes(k))
        const shell = key ? byLabel[key] : undefined
        if (shell) {
          await setNodeMeta(it.id, { shell, pinned: false })
          applied++
        }
      }
      toast.success(applied ? `AI 已重新分层 ${applied} 个节点` : 'AI 未给出分层调整')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'AI 分层失败')
    } finally {
      setLayouting(false)
    }
  }

  const addMajor = async () => {
    const v = majorDraft.trim()
    if (!v) return
    await updateProfile({ majorDirections: [...effectiveMajors(profile), v] })
    setMajorDraft('')
    setAddingMajor(false)
  }

  const selectedNode = selected?.type === 'node' ? posById.get(selected.id) : undefined
  const selectedEdge = selected?.type === 'edge' ? narrativeEdges.find((e) => e.id === selected.id) : undefined
  const edgeEndpoints =
    selectedEdge && posById.get(selectedEdge.sourceNodeId) && posById.get(selectedEdge.targetNodeId)
      ? {
          source: posById.get(selectedEdge.sourceNodeId)!.label,
          target: posById.get(selectedEdge.targetNodeId)!.label,
        }
      : null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">成果网络</h1>
          <p className="text-sm text-muted-foreground">成长星图 · 拖动旋转 · 滚轮缩放</p>
        </div>
        <div className="flex items-center gap-1.5">
          {addingMajor ? (
            <Input
              autoFocus
              value={majorDraft}
              onChange={(e) => setMajorDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void addMajor()
                if (e.key === 'Escape') setAddingMajor(false)
              }}
              onBlur={() => (majorDraft.trim() ? void addMajor() : setAddingMajor(false))}
              placeholder="专业方向"
              className="h-7 w-32 text-sm"
            />
          ) : (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAddingMajor(true)}>
              <Plus className="size-3" />
              方向
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={layouting || nodes.length < 2} onClick={() => void runAiLayout()}>
            {layouting ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
            AI 整理
          </Button>
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
            {/* 轨道环（最底层） */}
            <g fill="none" stroke="#7488b8">
              {orbitRadii.map((r, i) => (
                <ellipse
                  key={i}
                  cx={cx}
                  cy={cy}
                  rx={r * zoom}
                  ry={Math.max(r * ryFactor * zoom, 2)}
                  strokeWidth={1.2}
                  strokeOpacity={0.45}
                  strokeDasharray="2 5"
                />
              ))}
            </g>
            {/* 归属线：每个活动/课程连到专业方向 */}
            <g stroke="#5b6892" strokeOpacity={0.45}>
              {affiliations.map((a) => (
                <line key={a.id} x1={a.from.sx} y1={a.from.sy} x2={a.to.sx} y2={a.to.sy} strokeWidth={0.8} />
              ))}
            </g>
            {/* 叙事线弧（粗细由强度决定） */}
            <g>
              {narrativeEdges.map((e) => (
                <EdgeArc key={e.id} edge={e} posById={posById} cx={cx} cy={cy} />
              ))}
            </g>
            {/* 星点（后到前） */}
            {projected.map((p) => (
              <StarNode key={p.id} node={p} selected={selected?.type === 'node' && selected.id === p.id} />
            ))}
          </svg>

          {/* 选中节点卡片（锚定到星点当前投影位置） */}
          {selectedNode && (
            <div
              className="absolute z-30"
              style={{ left: clamp(selectedNode.sx + 16, 8, size.w - 256), top: clamp(selectedNode.sy - 20, 8, size.h - 160) }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <NodeCard node={selectedNode} onClose={() => setSelected(null)} />
            </div>
          )}
          {/* 选中边卡片 */}
          {selectedEdge && edgeEndpoints && (
            <div
              className="absolute z-30"
              style={{ left: clamp(edgeMidX(selectedEdge, posById, size.w), 8, size.w - 256), top: clamp(edgeMidY(selectedEdge, posById, size.h), 8, size.h - 160) }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <EdgeCard edge={selectedEdge} endpoints={edgeEndpoints} onClose={() => setSelected(null)} />
            </div>
          )}

          {/* 悬浮"全部事项"列表：绕开 3D 遮挡直接定位任意节点 */}
          <div className="absolute bottom-4 right-4 z-30" onPointerDown={(e) => e.stopPropagation()}>
            {listOpen ? (
              <NodeListPanel
                nodes={nodes}
                narrativeEdges={narrativeEdges}
                onSelect={(id) => {
                  setSelected({ type: 'node', id })
                  setListOpen(false)
                }}
                onClose={() => setListOpen(false)}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 bg-popover/90 shadow-md backdrop-blur"
                onClick={() => setListOpen(true)}
              >
                <List className="size-3.5" />
                全部（{nodes.length}）
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function edgeMidX(edge: NarrativeEdge, posById: Map<string, ProjectedNode>, w: number): number {
  const a = posById.get(edge.sourceNodeId)
  const b = posById.get(edge.targetNodeId)
  if (!a || !b) return w / 2
  return (a.sx + b.sx) / 2 + 12
}
function edgeMidY(edge: NarrativeEdge, posById: Map<string, ProjectedNode>, h: number): number {
  const a = posById.get(edge.sourceNodeId)
  const b = posById.get(edge.targetNodeId)
  if (!a || !b) return h / 2
  return (a.sy + b.sy) / 2
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
  const [ctrlX, ctrlY] = edgeControl(a, b, cx, cy)
  const opacity = 0.3 + ((a.t + b.t) / 2) * 0.45
  // 强度 1-5 → 线宽 1-4.5px
  const strength = edge.strength ?? 3
  const width = 1 + (clamp(strength, 1, 5) - 1) * 0.9
  return (
    <path
      d={`M ${a.sx} ${a.sy} Q ${ctrlX} ${ctrlY} ${b.sx} ${b.sy}`}
      fill="none"
      stroke="#9db2e0"
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap="round"
    />
  )
}

function StarNode({ node, selected }: { node: ProjectedNode; selected: boolean }) {
  const showLabel = node.kind === 'major' || node.radius > 13
  return (
    <g style={{ opacity: node.opacity }}>
      {/* 光晕 */}
      <circle cx={node.sx} cy={node.sy} r={node.radius * 1.9} fill={node.color} opacity={selected ? 0.28 : 0.14} />
      {selected && (
        <circle cx={node.sx} cy={node.sy} r={node.radius + 4} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.5} />
      )}
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

/** 叙事线弧的二次贝塞尔控制点：从画布中心向外推，形成弧（EdgeArc 与命中检测共用） */
function edgeControl(a: ProjectedNode, b: ProjectedNode, cx: number, cy: number): [number, number] {
  const mx = (a.sx + b.sx) / 2
  const my = (a.sy + b.sy) / 2
  const k = 0.25
  return [mx + (mx - cx) * k, my + (my - cy) * k]
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
