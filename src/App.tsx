import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChatView } from '@/components/chat/ChatView'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { SettingsDialog, type SettingsCategory } from '@/components/settings/SettingsDialog'
import { TasksView } from '@/components/tasks/TasksView'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useReminderStore } from '@/stores/reminderStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { AppView } from '@/types'

export default function App() {
  const [view, setView] = useState<AppView>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>('model')
  const settingsLoaded = useSettingsStore((s) => s.loaded)

  const openSettings = (category: SettingsCategory = 'model') => {
    setSettingsCategory(category)
    setSettingsOpen(true)
  }

  useEffect(() => {
    // 申请持久化存储资格，降低浏览器在磁盘紧张时自动清除 IndexedDB/OPFS 的风险
    void navigator.storage?.persist?.()
    void useSettingsStore.getState().load()
    void useChatStore.getState().init()
    // 规则引擎依赖档案/任务/事件，等 planning 加载完再算提醒
    void usePlanningStore
      .getState()
      .load()
      .then(() => useReminderStore.getState().init())
  }, [])

  if (!settingsLoaded) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar view={view} onViewChange={setView} onOpenSettings={() => openSettings()} />
        {view === 'dashboard' && <DashboardView onNavigate={setView} onOpenSettings={openSettings} />}
        {view === 'chat' && <ChatView onOpenSettings={() => openSettings('model')} />}
        {view === 'tasks' && <TasksView />}
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        category={settingsCategory}
        onCategoryChange={setSettingsCategory}
      />
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
