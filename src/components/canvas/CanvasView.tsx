import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PanelLeftClose, PanelLeftOpen, Trash2, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mono } from '@/components/ui/mono'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlanningStore } from '@/stores/planningStore'
import { daysUntil } from '@/lib/db/dates'
import { EVENT_CATEGORY_LABEL, type EventCategory } from '@/types'
import { cn } from '@/lib/utils'
import { buildCanvas, type CanvasNodeData } from './canvas-model'
import { CanvasNodeCard } from './CanvasNodeCard'
import { ReflectionEdge, type ReflectionEdgeData } from './ReflectionEdge'

const nodeTypes = { card: CanvasNodeCard }
const edgeTypes = { reflection: ReflectionEdge }

export function CanvasView() {
  const growthEvents = usePlanningStore((s) => s.growthEvents)
  const profile = usePlanningStore((s) => s.profile)
  const canvasNodes = usePlanningStore((s) => s.canvasNodes)
  const canvasEdges = usePlanningStore((s) => s.canvasEdges)
  const artifacts = usePlanningStore((s) => s.artifacts)
  const moveCanvasNode = usePlanningStore((s) => s.moveCanvasNode)
  const createCanvasEdge = usePlanningStore((s) => s.createCanvasEdge)
  const editCanvasEdge = usePlanningStore((s) => s.editCanvasEdge)
  const removeCanvasEdge = usePlanningStore((s) => s.removeCanvasEdge)

  // 窄屏下 288px 的抽屉会把画布挤没，默认收起；展开时改为浮层覆盖而不是挤压
  const [drawerOpen, setDrawerOpen] = useState(() => window.innerWidth >= 768)
  const [categoryFilter, setCategoryFilter] = useState<Set<EventCategory>>(new Set())
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const built = useMemo(
    () => buildCanvas({ growthEvents, profile, canvasNodes, canvasEdges, artifacts, categoryFilter }),
    [growthEvents, profile, canvasNodes, canvasEdges, artifacts, categoryFilter],
  )

  const derivedNodes: Node<CanvasNodeData>[] = useMemo(
    () => built.nodes.map((n) => ({ id: n.id, type: 'card', position: { x: n.x, y: n.y }, data: n.data })),
    [built.nodes],
  )

  const derivedEdges: Edge<ReflectionEdgeData>[] = useMemo(
    () =>
      built.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'reflection',
        selected: e.id === selectedEdgeId,
        data: { label: e.label, strength: e.strength, artifactTitle: e.artifactTitle },
      })),
    [built.edges, selectedEdgeId],
  )

  // 受控节点必须有 onNodesChange，否则拖动时位置不会更新。
  // 数据仍以 store 为准：派生结果变了就同步过来，拖动结束落库再读回。
  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges)
  useEffect(() => setNodes(derivedNodes), [derivedNodes, setNodes])
  useEffect(() => setEdges(derivedEdges), [derivedEdges, setEdges])

  const handleConnect: OnConnect = (conn) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    void createCanvasEdge({
      sourceNodeId: conn.source,
      targetNodeId: conn.target,
      label: '',
      strength: 3,
      source: 'manual',
    })
  }

  const selectedEdge = canvasEdges.find((e) => e.id === selectedEdgeId)
  const usedCategories = useMemo(
    () => [...new Set(growthEvents.map((e) => e.category))],
    [growthEvents],
  )

  return (
    <main className="relative flex min-h-0 flex-1">
      {drawerOpen && (
        <CanvasDrawer
          built={built}
          usedCategories={usedCategories}
          categoryFilter={categoryFilter}
          onToggleCategory={(c) => {
            setCategoryFilter((prev) => {
              const next = new Set(prev)
              if (next.has(c)) next.delete(c)
              else next.add(c)
              return next
            })
          }}
        />
      )}

      <div className="relative min-w-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={(_, node) => void moveCanvasNode(node.id, node.position.x, node.position.y)}
          onConnect={handleConnect}
          onEdgeClick={(_, edge) => setSelectedEdgeId(edge.id)}
          onPaneClick={() => setSelectedEdgeId(null)}
          fitView
          proOptions={{ hideAttribution: true }}
          className="bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} className="opacity-60" />
          <Controls showInteractive={false} className="!shadow-none" />
        </ReactFlow>

        <Button
          variant="outline"
          size="icon"
          className="absolute left-3 top-3 size-8 bg-card"
          aria-label={drawerOpen ? '收起面板' : '展开面板'}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {drawerOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </Button>

        {selectedEdge && (
          <aside className="absolute right-3 top-3 w-72 rounded-sm border bg-card p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <Mono className="text-muted-foreground">连接</Mono>
              <div className="flex gap-1">
                {selectedEdge.artifactId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="解绑反思"
                    onClick={() => void editCanvasEdge(selectedEdge.id, { artifactId: undefined })}
                  >
                    <Unlink className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="删除连接"
                  onClick={() => {
                    void removeCanvasEdge(selectedEdge.id)
                    setSelectedEdgeId(null)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            <Input
              value={selectedEdge.label}
              placeholder="这两件事之间发生了什么？"
              className="mb-2 h-8 text-sm"
              onChange={(e) => void editCanvasEdge(selectedEdge.id, { label: e.target.value })}
            />
            <label className="flex flex-col gap-1">
              <Mono className="text-muted-foreground">绑定反思</Mono>
              <select
                className="h-8 rounded-sm border bg-background px-2 text-sm"
                value={selectedEdge.artifactId ?? ''}
                onChange={(e) =>
                  void editCanvasEdge(selectedEdge.id, { artifactId: e.target.value || undefined })
                }
              >
                <option value="">未绑定</option>
                {artifacts
                  .filter((a) => a.kind === 'reflection')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
              </select>
            </label>
          </aside>
        )}
      </div>
    </main>
  )
}

interface DrawerProps {
  built: ReturnType<typeof buildCanvas>
  usedCategories: EventCategory[]
  categoryFilter: Set<EventCategory>
  onToggleCategory: (c: EventCategory) => void
}

/**
 * 画板左抽屉。列表模式是有意保留的——把截止日期只画在画板上，
 * 「下一件要做的事是什么」会比列表难看，这里按日期排序补上。
 */
function CanvasDrawer({ built, usedCategories, categoryFilter, onToggleCategory }: DrawerProps) {
  const growthEvents = usePlanningStore((s) => s.growthEvents)

  const upcoming = useMemo(
    () =>
      growthEvents
        .filter((e) => e.kind === 'short' && e.status === 'pending')
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [growthEvents],
  )
  const long = useMemo(
    () => growthEvents.filter((e) => e.kind === 'long'),
    [growthEvents],
  )

  return (
    <aside className="absolute inset-y-0 left-0 z-10 flex w-72 shrink-0 flex-col border-r bg-sidebar md:relative md:z-auto">
      <Tabs defaultValue="list" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="m-2 grid grid-cols-3">
          <TabsTrigger value="list">清单</TabsTrigger>
          <TabsTrigger value="pending">待连接</TabsTrigger>
          <TabsTrigger value="filter">筛选</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <Section title="待办与截止">
            {upcoming.length === 0 && <Empty>没有待办</Empty>}
            {upcoming.map((e) => {
              const days = daysUntil(e.startDate)
              return (
                <Row key={e.id} label={e.title}>
                  <Mono className={cn(days < 0 && 'text-destructive')}>
                    {days < 0 ? `逾期 ${-days} 天` : days === 0 ? '今天' : `${days} 天后`}
                  </Mono>
                </Row>
              )
            })}
          </Section>
          <Section title="长期事项">
            {long.length === 0 && <Empty>还没有长期事项</Empty>}
            {long.map((e) => (
              <Row key={e.id} label={e.title}>
                <Mono className="text-muted-foreground">
                  {e.endDate ? '已结束' : '进行中'}
                </Mono>
              </Row>
            ))}
          </Section>
        </TabsContent>

        <TabsContent value="pending" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
            还没连到任何两件事之间的反思。在画板上连一条边，再到边上绑定它。
          </p>
          {built.unlinkedReflections.length === 0 && <Empty>都已连接</Empty>}
          {built.unlinkedReflections.map((a) => (
            <Row key={a.id} label={a.title}>
              <Mono className="text-muted-foreground">
                {new Date(a.createdAt).toISOString().slice(0, 10)}
              </Mono>
            </Row>
          ))}
        </TabsContent>

        <TabsContent value="filter" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {categoryFilter.size === 0 ? '当前显示全部类别' : `已选 ${categoryFilter.size} 个类别`}
          </p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {usedCategories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onToggleCategory(c)}
                className={cn(
                  'rounded-sm border px-2 py-1 text-xs transition-colors',
                  categoryFilter.has(c)
                    ? 'border-foreground bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {EVENT_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <Mono className="mb-1 block px-1 text-muted-foreground">{title}</Mono>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-sm px-1 py-1 hover:bg-accent/60">
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-1 text-xs text-muted-foreground">{children}</p>
}
