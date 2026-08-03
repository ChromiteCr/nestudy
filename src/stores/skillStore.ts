import { create } from 'zustand'
import { setConversationSkill } from '@/lib/db/repositories'

/**
 * 当前激活的 skill。
 *
 * S8 起激活态**随会话持久化**（`conversations.skillName`）——以前只存在内存里，
 * 刷新一次就回到通用助手，用户以为还在 skill 里、模型其实已经不是那个人设了。
 * 切换会话会跟着切 skill：一个会话就是一次 skill run 的容器。
 */
interface SkillState {
  activeSkillName: string | null
  /** 激活态归属的会话；null 表示会话还没建（首条消息发出时补写） */
  conversationId: string | null
  hydrate: (conversationId: string | null, skillName: string | null) => void
  setActiveSkill: (name: string | null) => void
}

export const useSkillStore = create<SkillState>((set, get) => ({
  activeSkillName: null,
  conversationId: null,

  hydrate: (conversationId, skillName) => set({ conversationId, activeSkillName: skillName }),

  setActiveSkill: (name) => {
    set({ activeSkillName: name })
    const { conversationId } = get()
    if (conversationId) void setConversationSkill(conversationId, name)
  },
}))
