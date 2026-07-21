import { create } from 'zustand'
import type { Activity, EventItem, GraphNodeMeta, NarrativeEdge, Reflection, StudentProfile, Task } from '@/types'
import {
  addActivity,
  addEvent,
  addNarrativeEdge,
  addReflection,
  addTask,
  deleteActivity,
  deleteEvent,
  deleteNarrativeEdge,
  deleteReflection,
  deleteTask,
  getProfile,
  isoToday,
  listActivities,
  listEvents,
  listGraphNodeMeta,
  listNarrativeEdges,
  listReflections,
  listTasks,
  saveGraphNodeMeta,
  saveProfile,
  updateActivity,
  updateEvent,
  updateNarrativeEdge,
  updateReflection,
  updateTask,
} from '@/lib/db/planning'

/** 档案 + 日程 + 任务 + 活动 + 叙事线的统一状态。所有 mutation 落库后刷新内存态。 */
interface PlanningState {
  profile: StudentProfile | null
  events: EventItem[]
  tasks: Task[]
  activities: Activity[]
  narrativeEdges: NarrativeEdge[]
  graphMeta: Record<string, GraphNodeMeta>
  reflections: Reflection[]
  loaded: boolean

  load: () => Promise<void>
  updateProfile: (patch: Partial<Omit<StudentProfile, 'id'>>) => Promise<void>

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
  setNodeMeta: (nodeId: string, patch: Partial<Omit<GraphNodeMeta, 'nodeId'>>) => Promise<void>

  createReflection: (input: Omit<Reflection, 'id' | 'createdAt'>) => Promise<Reflection>
  editReflection: (id: string, patch: Partial<Omit<Reflection, 'id'>>) => Promise<void>
  removeReflection: (id: string) => Promise<void>
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  profile: null,
  events: [],
  tasks: [],
  activities: [],
  narrativeEdges: [],
  graphMeta: {},
  reflections: [],
  loaded: false,

  load: async () => {
    const [profile, events, tasks, activities, narrativeEdges, metaList, reflections] = await Promise.all([
      getProfile(),
      listEvents(),
      listTasks(),
      listActivities(),
      listNarrativeEdges(),
      listGraphNodeMeta(),
      listReflections(),
    ])
    const graphMeta = Object.fromEntries(metaList.map((m) => [m.nodeId, m]))
    set({ profile, events, tasks, activities, narrativeEdges, graphMeta, reflections, loaded: true })
  },

  updateProfile: async (patch) => {
    const profile = await saveProfile(patch)
    set({ profile })
  },

  createEvent: async (input) => {
    await addEvent(input)
    set({ events: await listEvents() })
  },

  editEvent: async (id, patch) => {
    await updateEvent(id, patch)
    set({ events: await listEvents() })
  },

  removeEvent: async (id) => {
    await deleteEvent(id)
    const [events, tasks] = await Promise.all([listEvents(), listTasks()])
    set({ events, tasks })
  },

  createTask: async (input) => {
    await addTask(input)
    set({ tasks: await listTasks() })
  },

  editTask: async (id, patch) => {
    await updateTask(id, patch)
    set({ tasks: await listTasks() })
  },

  toggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    await updateTask(id, { status: task.status === 'pending' ? 'completed' : 'pending' })
    set({ tasks: await listTasks() })
  },

  removeTask: async (id) => {
    await deleteTask(id)
    set({ tasks: await listTasks() })
  },

  createActivity: async (input) => {
    await addActivity(input)
    set({ activities: await listActivities() })
  },

  editActivity: async (id, patch) => {
    await updateActivity(id, patch)
    set({ activities: await listActivities() })
  },

  removeActivity: async (id) => {
    await deleteActivity(id)
    const [activities, narrativeEdges, reflections] = await Promise.all([
      listActivities(),
      listNarrativeEdges(),
      listReflections(),
    ])
    set({ activities, narrativeEdges, reflections })
  },

  createEdge: async (input) => {
    await addNarrativeEdge(input)
    set({ narrativeEdges: await listNarrativeEdges() })
  },

  editEdge: async (id, patch) => {
    await updateNarrativeEdge(id, patch)
    set({ narrativeEdges: await listNarrativeEdges() })
  },

  removeEdge: async (id) => {
    await deleteNarrativeEdge(id)
    set({ narrativeEdges: await listNarrativeEdges() })
  },

  refreshEdges: async () => {
    set({ narrativeEdges: await listNarrativeEdges() })
  },

  setNodeMeta: async (nodeId, patch) => {
    await saveGraphNodeMeta(nodeId, patch)
    const metaList = await listGraphNodeMeta()
    set({ graphMeta: Object.fromEntries(metaList.map((m) => [m.nodeId, m])) })
  },

  createReflection: async (input) => {
    const reflection = await addReflection(input)
    set({ reflections: await listReflections() })
    return reflection
  },

  editReflection: async (id, patch) => {
    await updateReflection(id, patch)
    set({ reflections: await listReflections() })
  },

  removeReflection: async (id) => {
    await deleteReflection(id)
    set({ reflections: await listReflections() })
  },
}))

/** 今日待办（含逾期未完成） */
export function selectTodayTasks(tasks: Task[]): Task[] {
  const today = isoToday()
  return tasks.filter((t) => t.status === 'pending' && t.dueDate <= today)
}

/** 未来 N 天内的事件 */
export function selectUpcomingEvents(events: EventItem[], days = 60): EventItem[] {
  const today = isoToday()
  return events.filter((e) => e.date >= today).slice(0, 50).filter((e) => {
    const diff = (new Date(e.date).getTime() - new Date(today).getTime()) / 86400000
    return diff <= days
  })
}
