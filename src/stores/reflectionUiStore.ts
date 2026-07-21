import { create } from 'zustand'

/** 跨视图的反思入口信号：从活动卡「反思一下」/星图反思卫星/主动提醒卡跳转到 Reflection Studio 时预置上下文 */
interface ReflectionUiState {
  pendingActivityId: string | null
  pendingOpenId: string | null
  setPendingActivityId: (id: string | null) => void
  setPendingOpenId: (id: string | null) => void
}

export const useReflectionUiStore = create<ReflectionUiState>((set) => ({
  pendingActivityId: null,
  pendingOpenId: null,
  setPendingActivityId: (id) => set({ pendingActivityId: id }),
  setPendingOpenId: (id) => set({ pendingOpenId: id }),
}))
