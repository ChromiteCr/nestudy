import { useCallback, useEffect, useMemo } from 'react'
import {
  addEdge,
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Network, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePlanningStore } from '@/stores/planningStore'
import { useChatStore } from '@/stores/chatStore'
import { buildGraphNodes, type GraphNode } from './graph-model'
import { GrowthNode, type GrowthNodeData } from './GrowthNode'
import type { AppView } from '@/types'

const nodeTypes = { growth: GrowthNode }

const NARRATIVE_PROMPT =
  '请用 get_activities 和 get_profile 了解我的活动、课程和目标学校，然后在同一轮里直接调用 propose_narrative 给出叙事线连接——哪些经历串成一条以个人成长为中心、最终指向申请目标的故事，每条连接说明为什么连。不要停下来只做说明或反问，读完数据就出提案卡。'

/** 按类型分列的确定性初始布局：课程左、活动中、目标校右 */
function layoutNodes(graphNodes: GraphNode[]): Node<GrowthNodeData>[] {
  const cols: Record<string, number> = { course: 0, activity: 340, school: 700 }
  const counters: Record<string, number> = { course: 0, activity: 0, school: 0 }
  return graphNodes.map((n) => {
    const y = counters[n.type] * 84
    counters[n.type] += 1
    return {
      id: n.id,
      type: 'growth',
      position: { x: cols[n.type], y },
      data: { label: n.label, sublabel: n.sublabel, nodeType: n.type, category: n.category },
    }
  })
}

interface GraphViewProps {
  onNavigate: (view: AppView) => void
}

export function GraphView({ onNavigate }: GraphViewProps) {
  const activities = usePlanningStore((s) => s.activities)
  const profile = usePlanningStore((s) => s.profile)
  const narrativeEdges = usePlanningStore((s) => s.narrativeEdges)
  const createEdge = usePlanningStore((s) => s.createEdge)
  const removeEdge = usePlanningStore((s) => s.removeEdge)
  const setPendingPrompt = useChatStore((s) => s.setPendingPrompt)

  const graphNodes = useMemo(() => buildGraphNodes(activities, profile), [activities, profile])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GrowthNodeData>>(layoutNodes(graphNodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // 节点集合变化（新增/删除活动/课程/目标校）时重排；拖动不触发
  const nodeKey = graphNodes.map((n) => n.id).join(',')
  useEffect(() => {
    setNodes(layoutNodes(graphNodes))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey])

  // 叙事线 → React Flow 边（含标签）
  useEffect(() => {
    setEdges(
      narrativeEdges.map((e) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        label: e.label,
        animated: e.source === 'ai',
        labelStyle: { fontSize: 10 },
        style: { strokeWidth: 1.5 },
      })),
    )
  }, [narrativeEdges, setEdges])

  // 手动连线 → 落库（乐观更新由 store 刷新 narrativeEdges 覆盖）
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return
      setEdges((eds) => addEdge(conn, eds))
      void createEdge({ sourceNodeId: conn.source, targetNodeId: conn.target, label: '', source: 'manual' })
    },
    [createEdge, setEdges],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) void removeEdge(e.id)
    },
    [removeEdge],
  )

  const askNarrative = () => {
    setPendingPrompt(NARRATIVE_PROMPT)
    onNavigate('chat')
  }

  const isEmpty = graphNodes.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="font-heading text-xl font-semibold">成果网络</h1>
          <p className="text-sm text-muted-foreground">
            以成长为中心的网络：活动 · 课程 · 目标校，用叙事线串成你的故事
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={askNarrative} disabled={activities.length < 2}>
          <Sparkles className="size-3.5" />
          AI 梳理叙事线
        </Button>
      </header>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <Network className="size-6 text-muted-foreground" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            还没有可展示的节点。先在「活动」里添加课外活动，或建立档案填入课程与目标校，
            它们会作为节点出现在这里。
          </p>
          <Button size="sm" variant="outline" onClick={() => onNavigate('activities')}>
            去添加活动
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            colorMode="system"
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </div>
  )
}
