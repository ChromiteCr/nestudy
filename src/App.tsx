import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChatView } from '@/components/chat/ChatView'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { TasksView } from '@/components/tasks/TasksView'
import { useChatStore } from '@/stores/chatStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { AppView } from '@/types'

export default function App() {
  const [view, setView] = useState<AppView>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsLoaded = useSettingsStore((s) => s.loaded)

  useEffect(() => {
    void useSettingsStore.getState().load()
    void useChatStore.getState().init()
    void usePlanningStore.getState().load()
  }, [])

  if (!settingsLoaded) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar view={view} onViewChange={setView} onOpenSettings={() => setSettingsOpen(true)} />
        {view === 'dashboard' && <DashboardView onNavigate={setView} />}
        {view === 'chat' && <ChatView onOpenSettings={() => setSettingsOpen(true)} />}
        {view === 'tasks' && <TasksView />}
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
