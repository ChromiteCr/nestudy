import { create } from 'zustand'

/** 跨视图的任务定位信号：从面板点击具体任务/DDL 跳转到任务页时，预置目标 tab + 高亮项 */
interface TaskUiState {
  pendingTab: 'today' | 'all' | 'ddl' | null
  pendingFocusId: string | null
  setPendingTab: (tab: 'today' | 'all' | 'ddl' | null) => void
  setPendingFocusId: (id: string | null) => void
}

export const useTaskUiStore = create<TaskUiState>((set) => ({
  pendingTab: null,
  pendingFocusId: null,
  setPendingTab: (tab) => set({ pendingTab: tab }),
  setPendingFocusId: (id) => set({ pendingFocusId: id }),
}))
