import { AppCredits } from '@/components/layout/AppCredits'
import { AppLayout } from '@/components/layout/AppLayout'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ReloadPrompt } from '@/features/pwa/ReloadPrompt'
import { ShortcutsDialog } from '@/features/shortcuts/ShortcutsDialog'
import { useAppShortcuts } from '@/features/shortcuts/useAppShortcuts'
import { FileDropOverlay } from '@/features/viewer/FileDropOverlay'
import { useApplyTheme } from '@/hooks/useApplyTheme'

function AppContent() {
  const theme = useApplyTheme()
  useAppShortcuts()

  return (
    <TooltipProvider delayDuration={400}>
      <AppLayout />
      <AppCredits />
      <FileDropOverlay />
      <ShortcutsDialog />
      <Toaster position="bottom-center" richColors theme={theme} />
      <ReloadPrompt />
    </TooltipProvider>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}
