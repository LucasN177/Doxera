import { FileUp, Images, Layers, ShieldCheck, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pickBatchFiles } from '@/features/batch/pickBatchFiles'
import { pickImagesForPdf } from '@/features/convert/pickImages'
import { RecentDocuments } from '@/features/library/RecentDocuments'
import { OfflineReady } from '@/features/pwa/OfflineReady'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { useUiStore } from '@/stores/uiStore'

export function EmptyState() {
  const { openFromPicker } = useOpenDocument()

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center gap-10 px-6 py-10">
        <div className="border-border bg-background flex w-full max-w-md flex-col items-center gap-4 rounded-xl border-2 border-dashed p-10 text-center">
          <div className="bg-primary/10 text-primary rounded-full p-4">
            <FileUp className="size-8" aria-hidden />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">PDF öffnen</h2>
            <p className="text-muted-foreground text-sm">
              Ziehe eine PDF-Datei oder Bilder hierher oder wähle eine Datei aus.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void openFromPicker()}>Datei auswählen</Button>
            <Button variant="outline" onClick={() => void pickImagesForPdf()}>
              <Images /> Bilder zu PDF
            </Button>
            <Button variant="outline" onClick={() => void pickBatchFiles()}>
              <Layers /> Mehrere Dateien verarbeiten
            </Button>
            <Button variant="outline" onClick={() => useUiStore.getState().setWorkflowsOpen(true)}>
              <Workflow /> Workflows
            </Button>
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Deine Dokumente werden ausschließlich lokal in deinem Browser verarbeitet.
          </p>
          <OfflineReady />
        </div>
        <RecentDocuments />
      </div>
    </div>
  )
}
