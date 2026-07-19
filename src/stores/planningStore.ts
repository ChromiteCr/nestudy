import { create } from 'zustand'
import type { EventItem, StudentProfile, Task } from '@/types'
import {
  addEvent,
  addTask,
  deleteEvent,
  deleteTask,
  getProfile,
  isoToday,
  listEvents,
  listTasks,
  saveProfile,
  updateEvent,
  updateTask,
} from '@/lib/db/planning'

/** 档案 + 日程 + 任务的统一状态。所有 mutation 落库后刷新内存态。 */
interface PlanningState {
  profile: StudentProfile | null
  events: EventItem[]
  tasks: Task[]
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
}

export const usePlanningStore = create<PlanningState>((set, get) => ({
  profile: null,
  events: [],
  tasks: [],
  loaded: false,

  load: async () => {
    const [profile, events, tasks] = await Promise.all([getProfile(), listEvents(), listTasks()])
    set({ profile, events, tasks, loaded: true })
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
