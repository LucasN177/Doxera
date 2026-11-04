import { Copy, Download, ScanText } from 'lucide-react'
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
import { toMarkdown, toPlainText, type TextBlock } from '@/engine/text/structure'
import { tableToCsv, tableToTsv } from '@/engine/text/tables'
import { saveFile } from '@/lib/download'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { collectText } from './collectText'

type Format = 'markdown' | 'text' | 'tables'
type Target = 'all' | 'selected' | 'current'

export function TextExportDialog() {
  const open = useUiStore((state) => state.textExportOpen)
  const setOpen = useUiStore((state) => state.setTextExportOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <TextExportContent onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function baseName(name: string) {
  return name.replace(/\.pdf$/i, '') || 'Dokument'
}

function TextExportContent({ onDone }: { onDone: () => void }) {
  const document = useDocumentStore((state) => state.document)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const [format, setFormat] = useState<Format>('markdown')
  const [target, setTarget] = useState<Target>(selectedIds.length > 1 ? 'selected' : 'all')
  const [result, setResult] = useState<{
    key: string
    pages: TextBlock[][]
    /** Page number of each entry in `pages`. */
    numbers: number[]
  } | null>(null)
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
  // Pages of the document (or their content) may change while the dialog is open
  const key = `${target}:${[...pageIds].join(',')}:${document?.pages.length}`

  useEffect(() => {
    let cancelled = false
    collectText(pageIds, (done, total) => !cancelled && setProgress({ done, total }))
      .then((pages) => {
        if (cancelled) return
        const numbers = (useDocumentStore.getState().document?.pages ?? []).flatMap(
          (page, index) => (pageIds.has(page.id) ? [index + 1] : []),
        )
        setResult({ key, pages, numbers })
        setFailed(false)
      })
      .catch((error: unknown) => {
        console.error('Text konnte nicht gelesen werden', error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [key, pageIds])

  const pages = result?.key === key ? result.pages : null
  const text = pages ? (format === 'markdown' ? toMarkdown(pages) : toPlainText(pages)) : ''
  const empty = pages !== null && !text.trim()
  const tables = (pages ?? []).flatMap((blocks, index) =>
    blocks.flatMap((block) =>
      block.type === 'table'
        ? [{ rows: block.rows, page: result?.numbers[index] ?? index + 1 }]
        : [],
    ),
  )
  const fileName = `${baseName(document?.name ?? '')}.${format === 'markdown' ? 'md' : 'txt'}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Text kopiert')
    } catch {
      toast.error('Der Text konnte nicht kopiert werden.')
    }
  }

  const download = async () => {
    const type = format === 'markdown' ? 'text/markdown' : 'text/plain'
    const file = new File([text], fileName, { type: `${type};charset=utf-8` })
    try {
      await saveFile(file)
    } catch (error) {
      console.error('Speichern fehlgeschlagen', error)
      toast.error('Die Datei konnte nicht gespeichert werden.')
    }
  }

  const choice = (selected: boolean) => cn(selected && 'ring-ring ring-1')

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Text exportieren</DialogTitle>
        <DialogDescription>
          Der Text des Dokuments mit erkannten Überschriften, Absätzen, Listen und Tabellen.
          Geschwärzte Zeilen werden ausgelassen.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex gap-2" role="radiogroup" aria-label="Format">
          {(
            [
              ['markdown', 'Markdown'],
              ['text', 'Nur Text'],
              ['tables', 'Tabellen (CSV)'],
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
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Seiten">
          {(
            [
              ['all', `Alle Seiten (${document?.pages.length ?? 0})`],
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
      </div>

      {failed ? (
        <p className="text-destructive text-sm">Der Text konnte nicht gelesen werden.</p>
      ) : pages === null ? (
        <p className="text-muted-foreground py-8 text-center text-sm" aria-live="polite">
          Text wird gelesen …{progress && ` Seite ${progress.done} von ${progress.total}`}
        </p>
      ) : empty ? (
        <div className="space-y-3 py-6 text-center">
          <p className="text-muted-foreground text-sm">
            Auf diesen Seiten wurde kein Text gefunden. Bei gescannten Seiten zuerst die
            Texterkennung ausführen.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onDone()
              useUiStore.getState().setOcrOpen(true)
            }}
          >
            <ScanText /> Texterkennung (OCR) …
          </Button>
        </div>
      ) : format === 'tables' ? (
        <TablesView tables={tables} name={baseName(document?.name ?? '')} />
      ) : (
        <textarea
          readOnly
          value={text}
          aria-label="Vorschau"
          spellCheck={false}
          className="bg-muted/40 h-72 w-full resize-y rounded-md border p-3 font-mono text-xs leading-relaxed outline-none"
        />
      )}

      <DialogFooter className={cn('gap-2', format === 'tables' && 'hidden')}>
        <Button variant="outline" onClick={() => void copy()} disabled={!text.trim()}>
          <Copy /> Kopieren
        </Button>
        <Button onClick={() => void download()} disabled={!text.trim()}>
          <Download /> {fileName.slice(fileName.lastIndexOf('.'))} speichern
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/** Rows shown per table in the preview. */
const PREVIEW_ROWS = 8

function TablesView({
  tables,
  name,
}: {
  tables: Array<{ rows: string[][]; page: number }>
  name: string
}) {
  if (tables.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Auf diesen Seiten wurden keine Tabellen erkannt. Erkannt werden Zeilen, deren Inhalte in
        mindestens zwei Spalten untereinander stehen (ab drei Zeilen).
      </p>
    )
  }

  const copy = async (rows: string[][]) => {
    try {
      await navigator.clipboard.writeText(tableToTsv(rows))
      toast.success('Tabelle kopiert', {
        description: 'Lässt sich direkt in eine Tabellenkalkulation einfügen.',
      })
    } catch {
      toast.error('Die Tabelle konnte nicht kopiert werden.')
    }
  }

  const save = async (rows: string[][], index: number) => {
    // BOM: Excel then reads the file as UTF-8 (umlauts, €)
    const file = new File(['\uFEFF', tableToCsv(rows)], `${name}-tabelle-${index + 1}.csv`, {
      type: 'text/csv;charset=utf-8',
    })
    try {
      await saveFile(file)
    } catch (error) {
      console.error('Speichern fehlgeschlagen', error)
      toast.error('Die Datei konnte nicht gespeichert werden.')
    }
  }

  return (
    <ol className="space-y-4">
      {tables.map(({ rows, page }, index) => (
        <li key={index} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-sm font-medium">
              Tabelle {index + 1}
              <span className="text-muted-foreground font-normal">
                {' '}
                · Seite {page} · {rows.length} × {rows[0]?.length ?? 0}
              </span>
            </p>
            <Button size="sm" variant="outline" onClick={() => void copy(rows)}>
              <Copy /> Kopieren
            </Button>
            <Button size="sm" onClick={() => void save(rows, index)}>
              <Download /> CSV
            </Button>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((cells, r) => (
                  <tr key={r} className={cn(r === 0 && 'bg-muted/60 font-medium')}>
                    {cells.map((cell, c) => (
                      <td key={c} className="border px-2 py-1 align-top whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW_ROWS && (
            <p className="text-muted-foreground text-xs">
              … {rows.length - PREVIEW_ROWS} weitere Zeilen
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
