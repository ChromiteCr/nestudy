import { useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChatView } from '@/components/chat/ChatView'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsLoaded = useSettingsStore((s) => s.loaded)

  useEffect(() => {
    void useSettingsStore.getState().load()
    void useChatStore.getState().init()
  }, [])

  if (!settingsLoaded) return null

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-dvh bg-background text-foreground">
        <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
        <ChatView onOpenSettings={() => setSettingsOpen(true)} />
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}
