import { Braces, FileSpreadsheet, FileText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { dataSummary, type DataContent, type DocumentData } from '@/engine/export/dataExport'
import { buildDataFiles, type DataFormat } from '@/engine/export/dataFiles'
import { deliverGeneratedFiles } from '@/lib/deliverFiles'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { collectData } from './collectData'
import { t } from '@/i18n'

type Format = DataFormat
type Target = 'all' | 'selected' | 'current'

const FORMATS = [
  {
    value: 'xlsx',
    label: t('Excel'),
    hint: t('Ein Blatt je Tabelle, Zahlen rechenbar'),
    icon: FileSpreadsheet,
  },
  { value: 'json', label: 'JSON', hint: t('Für Programme und Automatisierung'), icon: Braces },
  {
    value: 'csv',
    label: 'CSV',
    hint: t('Eine Datei je Teil, bei mehreren als ZIP'),
    icon: FileText,
  },
] as const

export function DataExportDialog() {
  const open = useUiStore((state) => state.dataExportOpen)
  const setOpen = useUiStore((state) => state.setDataExportOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <DataExportContent onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function baseName(name: string) {
  return name.replace(/\.pdf$/i, '') || t('Dokument')
}

function DataExportContent({ onDone }: { onDone: () => void }) {
  const document = useDocumentStore((state) => state.document)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const [format, setFormat] = useState<Format>('xlsx')
  const [target, setTarget] = useState<Target>(selectedIds.length > 1 ? 'selected' : 'all')
  const [content, setContent] = useState<DataContent>({
    text: true,
    tables: true,
    comments: true,
    highlights: true,
  })
  const [result, setResult] = useState<{ key: string; data: DocumentData } | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState(false)

  const pageIds = useMemo(() => {
    const pages = document?.pages ?? []
    if (target === 'selected' && selectedIds.length > 0) return new Set(selectedIds)
    if (target === 'current') {
      const page = pages[useViewerStore.getState().currentPage - 1]
      return new Set(page ? [page.id] : [])
    }
    return new Set(pages.map((page) => page.id))
  }, [document, target, selectedIds])
  const key = `${target}:${[...pageIds].join(',')}:${document?.pages.length}`

  useEffect(() => {
    let cancelled = false
    collectData(pageIds, (done, total) => !cancelled && setProgress({ done, total }))
      .then((data) => {
        if (cancelled) return
        setResult({ key, data })
        setFailed(false)
      })
      .catch((error: unknown) => {
        console.error('Daten konnten nicht gelesen werden', error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [key, pageIds])

  const data = result?.key === key ? result.data : null
  const summary = data ? dataSummary(data) : null
  const chosen =
    !!summary &&
    ((content.text && summary.blocks > 0) ||
      (content.tables && summary.tables > 0) ||
      (content.comments && summary.comments > 0) ||
      (content.highlights && summary.highlights > 0))

  const exportData = async () => {
    if (!data || !document) return
    const base = baseName(document.name)
    const toastId = toast.loading(t('Daten werden exportiert …'))
    try {
      const files = await buildDataFiles(data, content, format, base)
      onDone()
      await deliverGeneratedFiles(files, {
        archiveName: t('{base} (Daten)', { base }),
        toastId,
        noun: [t('Die Datei ist bereit.'), (count) => t('{count} Dateien sind bereit.', { count })],
      })
    } catch (error) {
      console.error('Datenexport fehlgeschlagen', error)
      toast.error(t('Die Daten konnten nicht exportiert werden.'), { id: toastId })
    }
  }

  const choice = (selected: boolean) => cn(selected && 'ring-ring ring-1')
  const toggle = (part: keyof DataContent) =>
    setContent((current) => ({ ...current, [part]: !current[part] }))

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t('Daten exportieren')}</DialogTitle>
        <DialogDescription>
          {t(
            'Text, erkannte Tabellen, Kommentare und markierten Text für Tabellenkalkulation oder Weiterverarbeitung. Geschwärzte Zeilen werden ausgelassen.',
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t('Format')}</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {FORMATS.map(({ value, label, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={format === value}
                className={cn(
                  'hover:bg-accent rounded-md border p-2.5 text-left',
                  format === value && 'border-primary ring-primary ring-1',
                )}
                onClick={() => setFormat(value)}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="size-4" aria-hidden /> {label}
                </span>
                <span className="text-muted-foreground block text-xs">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t('Inhalt')}</legend>
          {failed ? (
            <p className="text-destructive text-sm">
              {t('Der Inhalt konnte nicht gelesen werden.')}
            </p>
          ) : !summary ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {t('Inhalt wird gelesen …')}
              {progress &&
                t(' Seite {done} von {total}', { done: progress.done, total: progress.total })}
            </p>
          ) : (
            <div className="space-y-1.5">
              {(
                [
                  ['text', t('Text'), t('{blocks} Abschnitte', { blocks: summary.blocks })],
                  ['tables', t('Tabellen'), t('{tables} gefunden', { tables: summary.tables })],
                  [
                    'comments',
                    t('Kommentare'),
                    t('{comments} vorhanden', { comments: summary.comments }),
                  ],
                  [
                    'highlights',
                    t('Markierter Text'),
                    t('{highlights} vorhanden', { highlights: summary.highlights }),
                  ],
                ] as const
              ).map(([part, label, count]) => (
                <label key={part} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary size-4"
                    checked={content[part]}
                    onChange={() => toggle(part)}
                  />
                  {label}
                  <span className="text-muted-foreground text-xs">({count})</span>
                </label>
              ))}
              {summary.blocks === 0 && summary.tables === 0 && (
                <p className="text-muted-foreground text-xs">
                  {t(
                    'Kein Text gefunden – bei gescannten Seiten zuerst die Texterkennung ausführen.',
                  )}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">{t('Seiten')}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(
              [
                ['all', t('Alle ({value0})', { value0: document?.pages.length ?? 0 })],
                ...(selectedIds.length > 0
                  ? [
                      [
                        'selected',
                        t('Ausgewählte ({length})', { length: selectedIds.length }),
                      ] as const,
                    ]
                  : []),
                ['current', t('Aktuelle Seite')],
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
          {t('Abbrechen')}
        </Button>
        <Button onClick={() => void exportData()} disabled={!chosen}>
          {t('Exportieren')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
