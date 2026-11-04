import { ArrowDown, ArrowUp, ImagePlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/IconButton'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { imagesToPdf, type PageFormat } from '@/engine/convert/imagesToPdf'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { prepareImage } from '@/lib/images'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { pickImagesForPdf } from './pickImages'

/** Preview URLs of the listed images, freed when the dialog closes. */
const previews = new Map<File, string>()

function previewUrl(file: File): string {
  let url = previews.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    previews.set(file, url)
  }
  return url
}

function releasePreviews() {
  for (const url of previews.values()) URL.revokeObjectURL(url)
  previews.clear()
}

export function ImagesToPdfDialog() {
  const files = useUiStore((state) => state.imagesToPdf)
  const setFiles = useUiStore((state) => state.setImagesToPdf)
  const close = () => {
    releasePreviews()
    setFiles(null)
  }
  return (
    <Dialog open={files !== null} onOpenChange={(open) => !open && close()}>
      {files && <ImagesToPdfContent files={files} onDone={close} />}
    </Dialog>
  )
}

function ImagesToPdfContent({ files, onDone }: { files: File[]; onDone: () => void }) {
  const hasDocument = useDocumentStore((state) => state.document !== null)
  const [format, setFormat] = useState<PageFormat>('a4')
  const [margin, setMargin] = useState(true)
  const [busy, setBusy] = useState(false)
  const { open } = useOpenDocument()
  const setFiles = (next: File[]) => useUiStore.getState().setImagesToPdf(next)

  const move = (index: number, delta: number) => {
    const next = [...files]
    const [file] = next.splice(index, 1)
    next.splice(index + delta, 0, file)
    setFiles(next)
  }

  const build = async () => {
    const images = []
    for (const file of files) {
      try {
        images.push(await prepareImage(file))
      } catch {
        toast.error(`„${file.name}“ konnte nicht als Bild gelesen werden.`)
      }
    }
    if (images.length === 0) return null
    const name = files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'Bilder'
    const data = await imagesToPdf(images, {
      format,
      margin: margin && format !== 'image' ? 28 : 0,
      title: name,
    })
    return { name: `${name}.pdf`, data, count: images.length }
  }

  const run = async (mode: 'new' | 'append') => {
    setBusy(true)
    try {
      const result = await build()
      if (!result) return
      if (mode === 'new') {
        const file = new File([result.data.slice()], result.name, { type: 'application/pdf' })
        if (await open(file)) onDone()
        return
      }
      // After the page in view
      const index = useViewerStore.getState().currentPage
      const count = await useDocumentStore.getState().insertData(result.name, result.data, index)
      toast.success(`${count} ${count === 1 ? 'Seite' : 'Seiten'} eingefügt`)
      onDone()
    } catch (error) {
      console.error('PDF aus Bildern fehlgeschlagen', error)
      toast.error('Aus den Bildern konnte keine PDF erstellt werden.')
    } finally {
      setBusy(false)
    }
  }

  const choice = (selected: boolean) => cn(selected && 'ring-ring ring-1')

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Bilder zu PDF</DialogTitle>
        <DialogDescription>
          Jedes Bild wird eine Seite. Fotos vom iPhone (HEIC) werden unterstützt.
        </DialogDescription>
      </DialogHeader>

      <ol className="max-h-64 space-y-1 overflow-y-auto">
        {files.map((file, index) => (
          <li
            key={`${file.name}-${index}`}
            className="flex items-center gap-2 rounded-md border p-1.5"
          >
            <img src={previewUrl(file)} alt="" className="size-10 shrink-0 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="text-muted-foreground tabular-nums">{index + 1}. </span>
              {file.name}
            </span>
            <IconButton label="Nach oben" disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp />
            </IconButton>
            <IconButton
              label="Nach unten"
              disabled={index === files.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </IconButton>
            <IconButton
              label="Entfernen"
              onClick={() => setFiles(files.filter((_, other) => other !== index))}
            >
              <X />
            </IconButton>
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => void pickImagesForPdf()}
      >
        <ImagePlus /> Bilder hinzufügen
      </Button>

      <div className="space-y-3">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Seitengröße</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(
              [
                ['a4', 'A4'],
                ['letter', 'US Letter'],
                ['image', 'Wie das Bild'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                role="radio"
                aria-checked={format === value}
                variant={format === value ? 'secondary' : 'outline'}
                className={choice(format === value)}
                onClick={() => setFormat(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </fieldset>
        {format !== 'image' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary size-4"
              checked={margin}
              onChange={(event) => setMargin(event.target.checked)}
            />
            Rand um das Bild (1 cm)
          </label>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onDone} disabled={busy}>
          Abbrechen
        </Button>
        {hasDocument && (
          <Button
            variant="outline"
            onClick={() => void run('append')}
            disabled={busy || files.length === 0}
          >
            Als Seiten einfügen
          </Button>
        )}
        <Button onClick={() => void run('new')} disabled={busy || files.length === 0}>
          {busy ? 'Wird erstellt …' : 'Neue PDF erstellen'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
