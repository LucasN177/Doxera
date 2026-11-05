import { ArrowRight, Download, FileCheck2 } from 'lucide-react'
import { useState } from 'react'
import { documentBytes } from '@/features/document/documentBytes'
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
import type { CompressionLevel, CompressionResult } from '@/engine/mupdf/compress'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { createPdfFile, saveFile } from '@/lib/download'
import { formatFileSize } from '@/lib/file'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { t } from '@/i18n'

const LEVELS: Array<{ level: CompressionLevel; name: string; hint: string }> = [
  {
    level: 'medium',
    name: t('Ausgewogen'),
    hint: t('Bilder auf 150 dpi – gut lesbar und druckbar. Empfohlen.'),
  },
  {
    level: 'strong',
    name: t('Stark'),
    hint: t('Bilder auf 96 dpi – am kleinsten, für Bildschirm und E-Mail.'),
  },
  {
    level: 'lossless',
    name: t('Verlustfrei'),
    hint: t('Bilder bleiben unverändert; nur die Datei wird effizienter gespeichert.'),
  },
]

export function CompressDialog() {
  const open = useUiStore((state) => state.compressOpen)
  const setOpen = useUiStore((state) => state.setCompressOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <CompressContent onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function baseName(name: string) {
  return name.replace(/\.pdf$/i, '') || t('Dokument')
}

function CompressContent({ onDone }: { onDone: () => void }) {
  const name = useDocumentStore((state) => state.document?.name ?? t('Dokument.pdf'))
  const [level, setLevel] = useState<CompressionLevel>('medium')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CompressionResult | null>(null)
  const { open } = useOpenDocument()
  const fileName = `${baseName(name)} (komprimiert).pdf`

  const compress = async () => {
    setBusy(true)
    try {
      // The document as it would be exported (edits, annotations, redactions, forms)
      const data = await documentBytes()
      const { compressPdfData } = await import('@/engine/mupdf/client')
      setResult(await compressPdfData(data, level))
    } catch (error) {
      console.error('Komprimieren fehlgeschlagen', error)
      toast.error(t('Die PDF konnte nicht komprimiert werden.'))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!result) return
    try {
      await saveFile(createPdfFile(result.data, fileName))
    } catch (error) {
      console.error('Speichern fehlgeschlagen', error)
      toast.error(t('Die Datei konnte nicht gespeichert werden.'))
    }
  }

  const openResult = async () => {
    if (!result) return
    const file = createPdfFile(result.data, fileName)
    if (await open(file)) onDone()
  }

  const saved = result ? 1 - result.after / result.before : 0

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('PDF komprimieren')}</DialogTitle>
        <DialogDescription>
          {t(
            'Verkleinert große Bilder auf die Auflösung, in der sie angezeigt werden, und speichert die Datei effizienter. Läuft lokal im Browser.',
          )}
        </DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="space-y-3 py-1" aria-live="polite">
          <div className="flex items-center justify-center gap-3 text-lg tabular-nums">
            <span className="text-muted-foreground">{formatFileSize(result.before)}</span>
            <ArrowRight className="text-muted-foreground size-4" aria-hidden />
            <span className="font-semibold">{formatFileSize(result.after)}</span>
          </div>
          <p className="text-center text-sm">
            {saved >= 0.01 ? (
              <>
                <FileCheck2 className="mr-1 inline size-4 text-green-600" aria-hidden />
                {t('{percent} % kleiner', { percent: Math.round(saved * 100) })}
                {result.images.recompressed > 0 &&
                  t(' · {recompressed} von {total} Bildern verkleinert', {
                    recompressed: result.images.recompressed,
                    total: result.images.total,
                  })}
              </>
            ) : (
              t('Die Datei ist bereits gut komprimiert – kleiner geht es nicht.')
            )}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setResult(null)}>
              {t('Andere Stufe')}
            </Button>
            {saved >= 0.01 && (
              <>
                <Button variant="outline" onClick={() => void openResult()}>
                  {t('Öffnen')}
                </Button>
                <Button onClick={() => void save()}>
                  <Download /> {t('Speichern')}
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      ) : (
        <>
          <div className="space-y-2" role="radiogroup" aria-label={t('Stufe')}>
            {LEVELS.map((option) => (
              <button
                key={option.level}
                type="button"
                role="radio"
                aria-checked={level === option.level}
                className={cn(
                  'hover:bg-accent w-full rounded-md border p-3 text-left',
                  level === option.level && 'border-primary ring-primary ring-1',
                )}
                onClick={() => setLevel(option.level)}
              >
                <span className="block text-sm font-medium">{option.name}</span>
                <span className="text-muted-foreground block text-xs">{option.hint}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onDone} disabled={busy}>
              {t('Abbrechen')}
            </Button>
            <Button onClick={() => void compress()} disabled={busy}>
              {busy ? t('Wird komprimiert …') : t('Komprimieren')}
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  )
}
