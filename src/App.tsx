import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChatView } from '@/components/chat/ChatView'
import { CanvasView } from '@/components/canvas/CanvasView'
import { SettingsView } from '@/components/settings/SettingsView'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useReminderStore } from '@/stores/reminderStore'
import { useAccountStore } from '@/stores/accountStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useSkillStore } from '@/stores/skillStore'
import { SkillsView } from '@/components/skills/SkillsView'
import type { AppView } from '@/types'

export default function App() {
  const [view, setView] = useState<AppView>('chat')
  const settingsLoaded = useSettingsStore((s) => s.loaded)

  useEffect(() => {
    // 申请持久化存储资格，降低浏览器在磁盘紧张时自动清除 IndexedDB/OPFS 的风险
    void navigator.storage?.persist?.()
    void useSettingsStore.getState().load()
    // 账号在开屏就问一次，不等设置页挂载。**否则一个已经登录的人打开商店会被告知去登录**——
    // 本地有令牌但没人拿它换过身份，界面只能当作没登录
    void useAccountStore.getState().load()
    // 自建 skill 要在会话开始前灌进 lib/skills 的缓存，否则第一轮的
    // system prompt 里没有它们，agent 就"看不见"用户自己写的技能
    void useSkillStore.getState().load()
    void useChatStore.getState().init()
    // 规则引擎依赖档案/事项，等 planning 加载完再算提醒
    void usePlanningStore
      .getState()
      .load()
      .then(() => useReminderStore.getState().init())
  }, [])

  if (!settingsLoaded) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar view={view} onViewChange={setView} />
        {view === 'chat' && <ChatView onOpenSettings={() => setView('settings')} />}
        {view === 'canvas' && <CanvasView />}
        {view === 'skills' && <SkillsView onOpenChat={() => setView('chat')} />}
        {view === 'settings' && <SettingsView />}
      </div>
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
