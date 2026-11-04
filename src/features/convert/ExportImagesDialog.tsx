import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deliverGeneratedFiles } from '@/lib/deliverFiles'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { renderPagesAsImages, type ImageFormat } from './renderImages'

type Target = 'all' | 'selected' | 'current'

const RESOLUTIONS = [
  { dpi: 72, label: 'Bildschirm', hint: '72 dpi' },
  { dpi: 150, label: 'Standard', hint: '150 dpi' },
  { dpi: 300, label: 'Druck', hint: '300 dpi' },
]

export function ExportImagesDialog() {
  const open = useUiStore((state) => state.exportImagesOpen)
  const setOpen = useUiStore((state) => state.setExportImagesOpen)
  const running = useRef<AbortController | null>(null)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) running.current?.abort()
        setOpen(next)
      }}
    >
      {open && (
        <ExportImagesContent
          onRun={(controller) => {
            running.current = controller
          }}
          onCancel={() => running.current?.abort()}
          onDone={() => setOpen(false)}
        />
      )}
    </Dialog>
  )
}

function ExportImagesContent({
  onRun,
  onCancel,
  onDone,
}: {
  onRun: (controller: AbortController | null) => void
  onCancel: () => void
  onDone: () => void
}) {
  const pageCount = useDocumentStore((state) => state.document?.pages.length ?? 0)
  const name = useDocumentStore((state) => state.document?.name ?? 'Dokument')
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const [format, setFormat] = useState<ImageFormat>('png')
  const [dpi, setDpi] = useState(150)
  const [target, setTarget] = useState<Target>(selectedIds.length > 1 ? 'selected' : 'all')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const pageIds = (): Set<string> => {
    const pages = useDocumentStore.getState().document?.pages ?? []
    if (target === 'selected' && selectedIds.length > 0) return new Set(selectedIds)
    if (target === 'current') {
      const page = pages[useViewerStore.getState().currentPage - 1]
      return new Set(page ? [page.id] : [])
    }
    return new Set(pages.map((page) => page.id))
  }

  const start = async () => {
    const controller = new AbortController()
    onRun(controller)
    const ids = pageIds()
    setProgress({ done: 0, total: ids.size })
    const toastId = toast.loading('Bilder werden erstellt …')
    try {
      const files = await renderPagesAsImages({
        pageIds: ids,
        format,
        dpi,
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      })
      onDone()
      await deliverGeneratedFiles(files, {
        archiveName: `${name.replace(/\.pdf$/i, '')} (Bilder)`,
        toastId,
        noun: ['Bild', 'Bilder'],
      })
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        toast.info('Export abgebrochen', { id: toastId })
      } else {
        console.error('Bilder konnten nicht erstellt werden', error)
        toast.error('Die Bilder konnten nicht erstellt werden.', { id: toastId })
      }
      setProgress(null)
    } finally {
      onRun(null)
    }
  }

  const choice = (selected: boolean) => cn(selected && 'ring-ring ring-1')

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Seiten als Bilder exportieren</DialogTitle>
        <DialogDescription>
          Jede Seite wird ein Bild – mit allen Bearbeitungen, Anmerkungen und Schwärzungen.
        </DialogDescription>
      </DialogHeader>

      {progress ? (
        <div className="space-y-3 py-2" aria-live="polite">
          <p className="text-sm">
            Seite {Math.min(progress.done + 1, progress.total)} von {progress.total} wird gerendert
            …
          </p>
          <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar">
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Abbrechen
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Format</legend>
              <div className="flex gap-2" role="radiogroup">
                {(
                  [
                    ['png', 'PNG', 'verlustfrei'],
                    ['jpeg', 'JPEG', 'kleiner'],
                  ] as const
                ).map(([value, label, hint]) => (
                  <Button
                    key={value}
                    size="sm"
                    role="radio"
                    aria-checked={format === value}
                    variant={format === value ? 'secondary' : 'outline'}
                    className={choice(format === value)}
                    onClick={() => setFormat(value)}
                  >
                    {label} <span className="text-muted-foreground font-normal">{hint}</span>
                  </Button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Auflösung</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {RESOLUTIONS.map((option) => (
                  <Button
                    key={option.dpi}
                    size="sm"
                    role="radio"
                    aria-checked={dpi === option.dpi}
                    variant={dpi === option.dpi ? 'secondary' : 'outline'}
                    className={choice(dpi === option.dpi)}
                    onClick={() => setDpi(option.dpi)}
                  >
                    {option.label}{' '}
                    <span className="text-muted-foreground font-normal">{option.hint}</span>
                  </Button>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Seiten</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {(
                  [
                    ['all', `Alle (${pageCount})`],
                    ...(selectedIds.length > 0
                      ? [['selected', `Ausgewählte (${selectedIds.length})`] as const]
                      : []),
                    ['current', 'Aktuelle Seite'],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    role="radio"
                    aria-checked={target === value}
                    variant={target === value ? 'secondary' : 'outline'}
                    className={choice(target === value)}
                    onClick={() => setTarget(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onDone}>
              Abbrechen
            </Button>
            <Button onClick={() => void start()}>Exportieren</Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  )
}
