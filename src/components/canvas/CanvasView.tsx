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
import { TextField } from '@/components/ui/text-field'
import { Mono } from '@/components/ui/mono'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlanningStore } from '@/stores/planningStore'
import { ReflectionReader } from '@/components/artifacts/ReflectionReader'
import { depthOf } from '@/lib/engine/depth'
import { daysUntil } from '@/lib/db/dates'
import { resolveDeadline, referenceStamp } from '@/lib/capabilities/application'
import {
  APPLICATION_TRACK_LABEL,
  EVENT_CATEGORY_LABEL,
  type EventCategory,
  type GrowthEvent,
} from '@/types'
import { cn } from '@/lib/utils'
import { buildCanvas, type CanvasNodeData } from './canvas-model'
import { CanvasNodeCard } from './CanvasNodeCard'
import { ReflectionEdge, type ReflectionEdgeData } from './ReflectionEdge'
import { TimelineView } from './TimelineView'

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
  /*
    画板的两种看法：图看关系（谁影响了谁），轴看疏密（什么时候发生、哪一段空着）。

    **不进 URL、不进 settings。** 全仓没有路由；上一层的 `AppView` 本身就是
    `useState('chat')`、刷新回到聊天——上一层的导航都不持久化，
    却去持久化它的子模式，层级上说不通。而 URL 会让「轴」看起来像第五个导航目的地，
    正好违反「不动导航四项」。
  */
  const [mode, setMode] = useState<'graph' | 'axis'>('graph')
  const [categoryFilter, setCategoryFilter] = useState<Set<EventCategory>>(new Set())
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  /** 正在读哪一份记录。存 id 不存对象：artifacts 会变，存对象就会读到旧的 */
  const [readingId, setReadingId] = useState<string | null>(null)

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
          onRead={setReadingId}
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
        {/*
          两边都卸载，不用 display:none。切回图时视口重置是**代价不是 bug**——
          节点坐标是持久化的，丢的只是缩放平移。改成 display:none 会踩两个更难查的坑：
          隐藏期间 ReactFlow 量到 0×0（回显靠 ResizeObserver，只在特定时序复现），
          以及两者同挂载时那两个同步 effect 在不可见时继续跑。
        */}
        {mode === 'axis' ? (
          <TimelineView
            growthEvents={growthEvents}
            artifacts={artifacts}
            categoryFilter={categoryFilter}
            onRead={setReadingId}
          />
        ) : (
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
        )}

        {/*
          左上 chrome 簇。**必须挂在 ReactFlow 的兄弟层**：Background/Controls
          是它的 children，跟着一起消失。**不加 z-index**：抽屉在窄屏是 z-10
          的覆盖式浮层，给这一簇加 z 会让它盖住展开的抽屉。

          不塞进抽屉的 TabsList 是算术不是审美：抽屉 w-72 减去边距约 266px，
          4 列每格 66.5px、5 列每格 53.2px，而 TabsTrigger 无 truncate，
          「待连接」三字约 58px——**现有的 tab 会先溢出**。
          语义上也不对：抽屉四个 tab 是内容分区，视图切换是画布列的事。
        */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            className="size-8 bg-card"
            aria-label={drawerOpen ? '收起面板' : '展开面板'}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </Button>
          {/* 手写小分段控件而不复用 Tabs：Tabs 是抽屉的词汇。
              用「图 / 轴」两个汉字而不用图标——Waypoints 已经是导轨上「画板」那一项的图标，
              在画板内部再用它表示子模式会指代不清 */}
          <div role="group" aria-label="画板视图" className="flex rounded-sm border bg-card p-[3px]">
            {(['graph', 'axis'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-[3px] px-2.5 py-1 text-xs transition-colors',
                  mode === m ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'graph' ? '图' : '轴'}
              </button>
            ))}
          </div>
        </div>

        {/* 边是画板独有的对象，轴上没有对应物。只加渲染门、保留 state，
            回切时选中态还在，代价为零 */}
        {mode === 'graph' && selectedEdge && (
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
            <TextField
              label="这两件事之间发生了什么？"
              size="sm"
              wrapClassName="mb-2"
              value={selectedEdge.label}
              onChange={(e) => void editCanvasEdge(selectedEdge.id, { label: e.target.value })}
            />
            {selectedEdge.artifactId && (
              // 绑了反思却读不了，等于只看得见一个标题。这里是画板上离
              // 「这条边背后到底想了什么」最近的一个入口
              <Button
                variant="outline"
                size="sm"
                className="mb-2 w-full"
                onClick={() => setReadingId(selectedEdge.artifactId ?? null)}
              >
                读这份反思
              </Button>
            )}
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

      <ReflectionReader
        artifact={artifacts.find((a) => a.id === readingId) ?? null}
        onClose={() => setReadingId(null)}
      />
    </main>
  )
}

interface DrawerProps {
  built: ReturnType<typeof buildCanvas>
  usedCategories: EventCategory[]
  categoryFilter: Set<EventCategory>
  onToggleCategory: (c: EventCategory) => void
  /** 点开一份记录去读。抽屉自己不持有「在读哪份」，那是画板那一层的事 */
  onRead: (artifactId: string) => void
}

/**
 * 画板左抽屉。列表模式是有意保留的——把截止日期只画在画板上，
 * 「下一件要做的事是什么」会比列表难看，这里按日期排序补上。
 */
function CanvasDrawer({ built, usedCategories, categoryFilter, onToggleCategory, onRead }: DrawerProps) {
  // 没设主线就一个字都不多：不渲染标注控件，也不出那行说明
  const hasMainline = usePlanningStore((s) => (s.profile?.mainlines?.length ?? 0) > 0)
  const growthEvents = usePlanningStore((s) => s.growthEvents)
  // 算「长到第几层」要读反思：第三层的凭据是关联反思里的 takeaway
  const artifacts = usePlanningStore((s) => s.artifacts)

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
        <TabsList className="m-2 grid grid-cols-4">
          <TabsTrigger value="list">清单</TabsTrigger>
          <TabsTrigger value="applications">申请</TabsTrigger>
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
            {hasMainline && long.length > 0 && (
              <p className="px-1 pb-1 text-xs text-muted-foreground">标一下它在不在你那条线上。不标也行。</p>
            )}
            {long.map((e) => {
              const d = depthOf(e, artifacts)
              return (
                <Row key={e.id} label={e.title}>
                  {hasMainline && <MainlineMark event={e} />}
                  {/*
                    显示的是「长到第几层」而不是「做完没有」。
                    **这不是完成度**——只有履历的经历不代表没做好，代表它还没被消化。
                    所以第三层不加任何标记：到位了就该安静，加个对勾就成了打分表
                  */}
                  <Mono className={cn('text-muted-foreground', d.depth === 3 && 'text-foreground')}>
                    {d.label}
                  </Mono>
                </Row>
              )
            })}
          </Section>
        </TabsContent>

        <TabsContent value="applications" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <ApplicationList />
        </TabsContent>

        <TabsContent value="pending" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
            还没连到任何两件事之间的反思。在画板上连一条边，再到边上绑定它。
          </p>
          {built.unlinkedReflections.length === 0 && <Empty>都已连接</Empty>}
          {built.unlinkedReflections.map((a) => (
            <Row key={a.id} label={a.title} onClick={() => onRead(a.id)}>
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

/**
 * 申请清单。**S9 不新开视图**——申请落在这里，和别的 DDL 排在同一张画板上。
 * 申请季真正的问题从来不是"申请列表长什么样"，是"这周先干哪件"。
 *
 * 倒计时一律走 resolve_deadline 的换算结果，不自己拿日历日减：
 * 截止写的是学校当地的 11:59pm，夏令时一切，北京时间就差一小时。
 */
function ApplicationList() {
  const applications = usePlanningStore((s) => s.applications)
  const removeApplication = usePlanningStore((s) => s.removeApplication)

  const rows = useMemo(
    () =>
      applications.map((a) => ({
        application: a,
        resolved: resolveDeadline({ date: a.deadline, time: a.deadlineTime, timeZone: a.deadlineTimeZone }),
      })),
    [applications],
  )

  if (rows.length === 0) {
    return (
      <p className="px-1 py-2 text-xs leading-relaxed text-muted-foreground">
        还没有申请记录。在聊天里说说要申哪些学校，助手会整理成确认卡；确认后这里会出现倒计时，画板上也会多一个申请节点。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      {rows.map(({ application: a, resolved }) => {
        const done = a.materials.filter((m) => m.status === 'done').length
        const past = 'past' in resolved && resolved.past
        return (
          <div key={a.id} className="group rounded-sm border bg-card/60 px-2 py-1.5">
            <div className="flex items-baseline gap-1.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.schoolName}</span>
              <Mono className="shrink-0 text-muted-foreground">{APPLICATION_TRACK_LABEL[a.track]}</Mono>
              <button
                type="button"
                aria-label={`删除 ${a.schoolName} 的申请记录`}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => void removeApplication(a.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            {'error' in resolved ? (
              <Mono className="text-destructive">{resolved.error}</Mono>
            ) : (
              <>
                <Mono className={cn('block', past && 'text-destructive')}>{resolved.countdown}</Mono>
                <Mono className="block text-muted-foreground">
                  北京时间 {resolved.beijing}（当地 {a.deadlineTime} {resolved.localAbbr}）
                </Mono>
              </>
            )}
            {a.materials.length > 0 && (
              <Mono className="block text-muted-foreground">
                材料 {done}/{a.materials.length}
              </Mono>
            )}
          </div>
        )
      })}
      <p className="px-1 pt-1 text-xs leading-relaxed text-muted-foreground">{referenceStamp()}</p>
    </div>
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

/**
 * 「这件事在不在我那条线上」——**他自己按的那个按钮**。
 *
 * 这是整条比照链路里唯一 100% 属于学生的判据，永远压过我们对 `category` 的读法：
 * category 是模型填的，还带静默兜底，拿它指着一段经历说话，错的概率不低。
 *
 * **未标时不留常驻占位**，只在 hover / 键盘聚焦时露出来。每行挂一个空格子，
 * 和「第三层不加任何标记，加个对勾就成了打分表」是同一类毛病——
 * 一排等着被填的空位本身就是在催他。
 *
 * 放在清单里而不做成「记完当场问他一句」：刚讲完一段经历的那五分钟，
 * 他对「这算不算在我那条线上」最不客观，那时候什么都像在线上。
 * 清单是他回头看的地方，隔几天再标，标的是判断不是余温。
 */
function MainlineMark({ event }: { event: GrowthEvent }) {
  const editGrowthEvent = usePlanningStore((s) => s.editGrowthEvent)
  const mark = event.mainlineMark
  const next = mark === undefined ? 'on' : mark === 'on' ? 'off' : undefined
  return (
    <button
      type="button"
      className={cn(
        'shrink-0 rounded-sm px-1 text-xs transition-opacity',
        mark === undefined && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        mark === 'off' ? 'text-foreground' : 'text-muted-foreground',
      )}
      aria-label="标记这件事在不在你的主线上"
      onClick={() => void editGrowthEvent(event.id, { mainlineMark: next })}
    >
      {mark === 'on' ? '在线上' : mark === 'off' ? '不在' : '标一下'}
    </button>
  )
}

function Row({
  label,
  onClick,
  children,
}: {
  label: string
  /** 给了就渲染成按钮。没给的行保持原样——不是每一行都有东西可点开 */
  onClick?: () => void
  children: React.ReactNode
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {children}
    </>
  )
  const shell =
    'group flex w-full items-baseline justify-between gap-2 rounded-sm px-1 py-1 text-left hover:bg-accent/60'
  return onClick ? (
    <button type="button" className={shell} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={shell}>{inner}</div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-1 text-xs text-muted-foreground">{children}</p>
}
