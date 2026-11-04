import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ReloadPrompt } from '@/features/pwa/ReloadPrompt'
import { FileDropOverlay } from '@/features/viewer/FileDropOverlay'

export function App() {
  return (
    <TooltipProvider delayDuration={400}>
      <AppLayout />
      <FileDropOverlay />
      <Toaster position="bottom-center" richColors />
      <ReloadPrompt />
    </TooltipProvider>
  )
}
