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
import { useSettingsStore } from '@/stores/settingsStore'
import type { AppView } from '@/types'

export default function App() {
  const [view, setView] = useState<AppView>('chat')
  const settingsLoaded = useSettingsStore((s) => s.loaded)

  useEffect(() => {
    // 申请持久化存储资格，降低浏览器在磁盘紧张时自动清除 IndexedDB/OPFS 的风险
    void navigator.storage?.persist?.()
    void useSettingsStore.getState().load()
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
        {view === 'settings' && <SettingsView />}
      </div>
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
