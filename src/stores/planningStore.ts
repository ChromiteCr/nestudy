import { create } from 'zustand'
import type {
  Activity,
  Artifact,
  CanvasEdge,
  CanvasNode,
  EventItem,
  GraphNodeId,
  GrowthEvent,
  NarrativeEdge,
  Reflection,
  StudentProfile,
  Task,
} from '@/types'
import { listArtifacts } from '@/lib/db/artifacts'
import {
  addCanvasEdge,
  deleteCanvasEdge,
  listCanvasEdges,
  listCanvasNodes,
  saveCanvasNode,
  updateCanvasEdge,
} from '@/lib/db/canvas'
import { addGrowthEvent, deleteGrowthEvent, listGrowthEvents, updateGrowthEvent } from '@/lib/db/events'
import {
  addActivity,
  addEvent,
  addReflection,
  addTask,
  deleteActivity,
  deleteEvent,
  deleteReflection,
  deleteTask,
  getProfile,
  isScheduleEvent,
  isTaskEvent,
  isoToday,
  saveProfile,
  toActivity,
  toEventItem,
  toNarrativeEdge,
  toReflection,
  toTask,
  updateActivity,
  updateEvent,
  updateReflection,
  updateTask,
} from '@/lib/db/planning'

/**
 * 档案 + 事项 + 资产 + 画板的统一状态。
 *
 * S6 起底层是 growthEvents / artifacts / canvas*；`tasks` / `events` / `activities` /
 * `reflections` / `narrativeEdges` 是内存里派生出来的旧形状，仍在为 AI 提案链路
 * （tools / proposals / rules / ProposalCard）服务——那部分按计划在 S8 随
 * Capability 层一起重构，届时这几个派生字段一并删除。
 */
interface PlanningState {
  profile: StudentProfile | null
  growthEvents: GrowthEvent[]
  artifacts: Artifact[]
  canvasNodes: CanvasNode[]
  canvasEdges: CanvasEdge[]
  loaded: boolean

  // 派生的旧形状（S8 删除）
  events: EventItem[]
  tasks: Task[]
  activities: Activity[]
  reflections: Reflection[]
  narrativeEdges: NarrativeEdge[]

  load: () => Promise<void>
  updateProfile: (patch: Partial<Omit<StudentProfile, 'id'>>) => Promise<void>

  createGrowthEvent: (input: Omit<GrowthEvent, 'id' | 'createdAt'>) => Promise<void>
  editGrowthEvent: (id: string, patch: Partial<Omit<GrowthEvent, 'id'>>) => Promise<void>
  removeGrowthEvent: (id: string) => Promise<void>

  moveCanvasNode: (id: GraphNodeId, x: number, y: number) => Promise<void>
  annotateCanvasNode: (id: GraphNodeId, blurb: string) => Promise<void>
  createCanvasEdge: (input: Omit<CanvasEdge, 'id' | 'createdAt'>) => Promise<void>
  editCanvasEdge: (id: string, patch: Partial<Omit<CanvasEdge, 'id'>>) => Promise<void>
  removeCanvasEdge: (id: string) => Promise<void>

  createEvent: (input: Omit<EventItem, 'id' | 'createdAt'>) => Promise<void>
  editEvent: (id: string, patch: Partial<Omit<EventItem, 'id'>>) => Promise<void>
  removeEvent: (id: string) => Promise<void>

  createTask: (input: Omit<Task, 'id' | 'createdAt' | 'status'>) => Promise<void>
  editTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => Promise<void>
  toggleTask: (id: string) => Promise<void>
  removeTask: (id: string) => Promise<void>

  createActivity: (input: Omit<Activity, 'id' | 'createdAt'>) => Promise<void>
  editActivity: (id: string, patch: Partial<Omit<Activity, 'id'>>) => Promise<void>
  removeActivity: (id: string) => Promise<void>

  createEdge: (input: Omit<NarrativeEdge, 'id' | 'createdAt'>) => Promise<void>
  editEdge: (id: string, patch: Partial<Omit<NarrativeEdge, 'id'>>) => Promise<void>
  removeEdge: (id: string) => Promise<void>
  refreshEdges: () => Promise<void>

  createReflection: (input: Omit<Reflection, 'id' | 'createdAt'>) => Promise<Reflection>
  editReflection: (id: string, patch: Partial<Omit<Reflection, 'id'>>) => Promise<void>
  removeReflection: (id: string) => Promise<void>
}

/** 从新模型一次性算出所有派生字段，避免各处 mutation 各自维护一遍 */
function derive(growthEvents: GrowthEvent[], artifacts: Artifact[], canvasEdges: CanvasEdge[]) {
  return {
    events: growthEvents.filter(isScheduleEvent).map(toEventItem),
    tasks: growthEvents.filter(isTaskEvent).map(toTask),
    activities: growthEvents
      .filter((e) => e.kind === 'long')
      .map(toActivity)
      .sort((a, b) => {
        if (!a.endDate && b.endDate) return -1
        if (a.endDate && !b.endDate) return 1
        return b.startDate.localeCompare(a.startDate)
      }),
    reflections: artifacts.filter((a) => a.kind === 'reflection').map(toReflection),
    narrativeEdges: canvasEdges.map(toNarrativeEdge),
  }
}

export const usePlanningStore = create<PlanningState>((set, get) => {
  /** 全量重读。数据量是个人尺度（数百条），重读比增量维护更不容易出错 */
  const refresh = async () => {
    const [growthEvents, artifacts, canvasNodes, canvasEdges] = await Promise.all([
      listGrowthEvents(),
      listArtifacts(),
      listCanvasNodes(),
      listCanvasEdges(),
    ])
    set({
      growthEvents,
      artifacts,
      canvasNodes,
      canvasEdges,
      ...derive(growthEvents, artifacts, canvasEdges),
    })
  }

  return {
    profile: null,
    growthEvents: [],
    artifacts: [],
    canvasNodes: [],
    canvasEdges: [],
    loaded: false,
    events: [],
    tasks: [],
    activities: [],
    reflections: [],
    narrativeEdges: [],

    load: async () => {
      const profile = await getProfile()
      await refresh()
      set({ profile, loaded: true })
    },

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

    createEvent: async (input) => {
      await addEvent(input)
      await refresh()
    },
    editEvent: async (id, patch) => {
      await updateEvent(id, patch)
      await refresh()
    },
    removeEvent: async (id) => {
      await deleteEvent(id)
      await refresh()
    },

    createTask: async (input) => {
      await addTask(input)
      await refresh()
    },
    editTask: async (id, patch) => {
      await updateTask(id, patch)
      await refresh()
    },
    toggleTask: async (id) => {
      const task = get().tasks.find((t) => t.id === id)
      if (!task) return
      await updateTask(id, { status: task.status === 'pending' ? 'completed' : 'pending' })
      await refresh()
    },
    removeTask: async (id) => {
      await deleteTask(id)
      await refresh()
    },

    createActivity: async (input) => {
      await addActivity(input)
      await refresh()
    },
    editActivity: async (id, patch) => {
      await updateActivity(id, patch)
      await refresh()
    },
    removeActivity: async (id) => {
      await deleteActivity(id)
      await refresh()
    },

    createEdge: async (input) => {
      await addCanvasEdge(input)
      await refresh()
    },
    editEdge: async (id, patch) => {
      await updateCanvasEdge(id, patch)
      await refresh()
    },
    removeEdge: async (id) => {
      await deleteCanvasEdge(id)
      await refresh()
    },
    refreshEdges: refresh,

    createReflection: async (input) => {
      const reflection = await addReflection(input)
      await refresh()
      return reflection
    },
    editReflection: async (id, patch) => {
      await updateReflection(id, patch)
      await refresh()
    },
    removeReflection: async (id) => {
      await deleteReflection(id)
      await refresh()
    },
  }
})

/** 今日待办（含逾期未完成） */
export function selectTodayTasks(tasks: Task[]): Task[] {
  const today = isoToday()
  return tasks.filter((t) => t.status === 'pending' && t.dueDate <= today)
}

/** 未来 N 天内的事件 */
export function selectUpcomingEvents(events: EventItem[], days = 60): EventItem[] {
  const today = isoToday()
  return events
    .filter((e) => e.date >= today)
    .slice(0, 50)
    .filter((e) => (new Date(e.date).getTime() - new Date(today).getTime()) / 86400000 <= days)
}
