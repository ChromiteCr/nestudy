import { create } from 'zustand'
import type { Artifact, CanvasEdge, CanvasNode, GraphNodeId, GrowthEvent, StudentProfile } from '@/types'
import { addArtifact, deleteArtifact, listArtifacts, updateArtifact } from '@/lib/db/artifacts'
import {
  addCanvasEdge,
  deleteCanvasEdge,
  listCanvasEdges,
  listCanvasNodes,
  saveCanvasNode,
  updateCanvasEdge,
} from '@/lib/db/canvas'
import { addGrowthEvent, deleteGrowthEvent, listGrowthEvents, updateGrowthEvent } from '@/lib/db/events'
import { getProfile, saveProfile } from '@/lib/db/profile'

/**
 * 档案 + 事项 + 资产 + 画板的统一状态。
 *
 * S8 起只有新模型：S6 遗留的 tasks / events / activities / reflections /
 * narrativeEdges 派生数组随兼容层一起删掉了，AI 提案链路已经改吃 growthEvents。
 */
interface PlanningState {
  profile: StudentProfile | null
  growthEvents: GrowthEvent[]
  artifacts: Artifact[]
  canvasNodes: CanvasNode[]
  canvasEdges: CanvasEdge[]
  loaded: boolean

  load: () => Promise<void>
  /** 全量重读。提案确认后批量写完调一次，比每写一条刷一次省事 */
  refresh: () => Promise<void>
  updateProfile: (patch: Partial<Omit<StudentProfile, 'id'>>) => Promise<void>

  createGrowthEvent: (input: Omit<GrowthEvent, 'id' | 'createdAt'>) => Promise<void>
  editGrowthEvent: (id: string, patch: Partial<Omit<GrowthEvent, 'id'>>) => Promise<void>
  removeGrowthEvent: (id: string) => Promise<void>

  createArtifact: (input: Omit<Artifact, 'id' | 'createdAt'>) => Promise<Artifact>
  editArtifact: (id: string, patch: Partial<Omit<Artifact, 'id'>>) => Promise<void>
  removeArtifact: (id: string) => Promise<void>

  moveCanvasNode: (id: GraphNodeId, x: number, y: number) => Promise<void>
  annotateCanvasNode: (id: GraphNodeId, blurb: string) => Promise<void>
  createCanvasEdge: (input: Omit<CanvasEdge, 'id' | 'createdAt'>) => Promise<void>
  editCanvasEdge: (id: string, patch: Partial<Omit<CanvasEdge, 'id'>>) => Promise<void>
  removeCanvasEdge: (id: string) => Promise<void>
}

export const usePlanningStore = create<PlanningState>((set) => {
  /** 数据量是个人尺度（数百条），重读比增量维护更不容易出错 */
  const refresh = async () => {
    const [growthEvents, artifacts, canvasNodes, canvasEdges] = await Promise.all([
      listGrowthEvents(),
      listArtifacts(),
      listCanvasNodes(),
      listCanvasEdges(),
    ])
    set({ growthEvents, artifacts, canvasNodes, canvasEdges })
  }

  return {
    profile: null,
    growthEvents: [],
    artifacts: [],
    canvasNodes: [],
    canvasEdges: [],
    loaded: false,

    load: async () => {
      const profile = await getProfile()
      await refresh()
      set({ profile, loaded: true })
    },

    refresh,

    updateProfile: async (patch) => {
      set({ profile: await saveProfile(patch) })
    },

    createGrowthEvent: async (input) => {
      await addGrowthEvent(input)
      await refresh()
    },
    editGrowthEvent: async (id, patch) => {
      await updateGrowthEvent(id, patch)
      await refresh()
    },
    removeGrowthEvent: async (id) => {
      await deleteGrowthEvent(id)
      await refresh()
    },

    createArtifact: async (input) => {
      const artifact = await addArtifact(input)
      await refresh()
      return artifact
    },
    editArtifact: async (id, patch) => {
      await updateArtifact(id, patch)
      await refresh()
    },
    removeArtifact: async (id) => {
      await deleteArtifact(id)
      await refresh()
    },

    moveCanvasNode: async (id, x, y) => {
      await saveCanvasNode(id, { x, y })
      set({ canvasNodes: await listCanvasNodes() })
    },
    annotateCanvasNode: async (id, blurb) => {
      await saveCanvasNode(id, { blurb })
      set({ canvasNodes: await listCanvasNodes() })
    },
    createCanvasEdge: async (input) => {
      await addCanvasEdge(input)
      await refresh()
    },
    editCanvasEdge: async (id, patch) => {
      await updateCanvasEdge(id, patch)
      await refresh()
    },
    removeCanvasEdge: async (id) => {
      await deleteCanvasEdge(id)
      await refresh()
    },
  }
})
