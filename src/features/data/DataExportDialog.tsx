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
import {
  dataSummary,
  toCsvFiles,
  toJson,
  toSheets,
  type DataContent,
  type DocumentData,
} from '@/engine/export/dataExport'
import { deliverGeneratedFiles } from '@/lib/deliverFiles'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { collectData } from './collectData'

type Format = 'xlsx' | 'json' | 'csv'
type Target = 'all' | 'selected' | 'current'

const FORMATS = [
  {
    value: 'xlsx',
    label: 'Excel',
    hint: 'Ein Blatt je Tabelle, Zahlen rechenbar',
    icon: FileSpreadsheet,
  },
  { value: 'json', label: 'JSON', hint: 'Für Programme und Automatisierung', icon: Braces },
  { value: 'csv', label: 'CSV', hint: 'Eine Datei je Teil, bei mehreren als ZIP', icon: FileText },
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
  return name.replace(/\.pdf$/i, '') || 'Dokument'
}

function DataExportContent({ onDone }: { onDone: () => void }) {
  const document = useDocumentStore((state) => state.document)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const [format, setFormat] = useState<Format>('xlsx')
  const [target, setTarget] = useState<Target>(selectedIds.length > 1 ? 'selected' : 'all')
  const [content, setContent] = useState<DataContent>({ text: true, tables: true, comments: true })
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
      (content.comments && summary.comments > 0))

  const exportData = async () => {
    if (!data || !document) return
    const base = baseName(document.name)
    const toastId = toast.loading('Daten werden exportiert …')
    try {
      let files: File[]
      if (format === 'json') {
        files = [new File([toJson(data, content)], `${base}.json`, { type: 'application/json' })]
      } else if (format === 'xlsx') {
        const { buildXlsx, XLSX_TYPE } = await import('@/engine/export/xlsx')
        const workbook = buildXlsx(toSheets(data, content))
        files = [new File([workbook.slice()], `${base}.xlsx`, { type: XLSX_TYPE })]
      } else {
        files = toCsvFiles(data, content, base).map(
          // BOM: Excel then reads the files as UTF-8 (umlauts, €)
          ({ name, text }) => new File(['\uFEFF', text], name, { type: 'text/csv;charset=utf-8' }),
        )
      }
      onDone()
      await deliverGeneratedFiles(files, {
        archiveName: `${base} (Daten)`,
        toastId,
        noun: ['Die Datei', 'Dateien'],
      })
    } catch (error) {
      console.error('Datenexport fehlgeschlagen', error)
      toast.error('Die Daten konnten nicht exportiert werden.', { id: toastId })
    }
  }

  const choice = (selected: boolean) => cn(selected && 'ring-ring ring-1')
  const toggle = (part: keyof DataContent) =>
    setContent((current) => ({ ...current, [part]: !current[part] }))

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Daten exportieren</DialogTitle>
        <DialogDescription>
          Text, erkannte Tabellen und Kommentare für Tabellenkalkulation oder Weiterverarbeitung.
          Geschwärzte Zeilen werden ausgelassen.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Format</legend>
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
          <legend className="text-sm font-medium">Inhalt</legend>
          {failed ? (
            <p className="text-destructive text-sm">Der Inhalt konnte nicht gelesen werden.</p>
          ) : !summary ? (
            <p className="text-muted-foreground text-sm" aria-live="polite">
              Inhalt wird gelesen …{progress && ` Seite ${progress.done} von ${progress.total}`}
            </p>
          ) : (
            <div className="space-y-1.5">
              {(
                [
                  ['text', 'Text', `${summary.blocks} Abschnitte`],
                  ['tables', 'Tabellen', `${summary.tables} gefunden`],
                  ['comments', 'Kommentare', `${summary.comments} vorhanden`],
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
                  Kein Text gefunden – bei gescannten Seiten zuerst die Texterkennung ausführen.
                </p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Seiten</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {(
              [
                ['all', `Alle (${document?.pages.length ?? 0})`],
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
        <Button onClick={() => void exportData()} disabled={!chosen}>
          Exportieren
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
