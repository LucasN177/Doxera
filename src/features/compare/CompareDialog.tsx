import { ArrowLeftRight, GitCompareArrows } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { compareTexts, type TextChange, type TextLineRef } from '@/engine/compare/compare'
import { pdfTextLines } from '@/engine/compare/extract'
import { closePdf, openPdf } from '@/engine/render/pdfjs'
import { documentBytes } from '@/features/document/documentBytes'
import { cn } from '@/lib/utils'
import { unlock, useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { t } from '@/i18n'

export function CompareDialog() {
  const compare = useUiStore((state) => state.compare)
  const setCompare = useUiStore((state) => state.setCompare)
  const open = !!compare?.open
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => compare && setCompare({ ...compare, open: value })}
    >
      {open && compare && <CompareContent file={compare.file} />}
    </Dialog>
  )
}

/** Text of the picked file, kept while it stays the comparison file. */
const fileLines = new WeakMap<File, Promise<TextLineRef[]>>()

async function readLines(data: Uint8Array): Promise<TextLineRef[]> {
  const pdf = await openPdf(data)
  try {
    return await pdfTextLines(pdf)
  } finally {
    void closePdf(pdf)
  }
}

function linesOfFile(file: File): Promise<TextLineRef[]> {
  let lines = fileLines.get(file)
  if (!lines) {
    lines = file
      .arrayBuffer()
      .then((buffer) => unlock(file.name, new Uint8Array(buffer)))
      .then(readLines)
    lines.catch(() => fileLines.delete(file))
    fileLines.set(file, lines)
  }
  return lines
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; file: TextLineRef[]; opened: TextLineRef[] }

/** Shown changes at most; the summary still counts all. */
const MAX_SHOWN = 500

function CompareContent({ file }: { file: File }) {
  const name = useDocumentStore((state) => state.document?.name ?? t('Dokument'))
  const [state, setState] = useState<State>({ status: 'loading' })
  // false: the picked file is the older version, the open document the newer one
  const [swapped, setSwapped] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([linesOfFile(file), documentBytes().then(readLines)])
      .then(([fileText, opened]) => {
        if (!cancelled) setState({ status: 'ready', file: fileText, opened })
      })
      .catch((error: unknown) => {
        console.error('Vergleich fehlgeschlagen', error)
        if (cancelled) return
        const cancelledByUser = (error as { reason?: string }).reason === 'cancelled'
        setState({
          status: 'error',
          message: cancelledByUser
            ? t('Ohne Passwort lässt sich die Datei nicht vergleichen.')
            : t('Die Dateien konnten nicht verglichen werden.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [file])

  let result = null
  if (state.status === 'ready') {
    result = swapped
      ? compareTexts(state.opened, state.file)
      : compareTexts(state.file, state.opened)
  }

  const oldName = swapped ? name : file.name
  const newName = swapped ? file.name : name
  /** Page of a change in the open document. */
  const currentPage = (change: TextChange) => (swapped ? change.oldPage : change.newPage)

  const show = (change: TextChange) => {
    useViewerStore.getState().goToPage(currentPage(change) + 1)
    useUiStore.getState().setCompare({ file, open: false })
  }

  const noText = state.status === 'ready' && (state.file.length === 0 || state.opened.length === 0)

  return (
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <GitCompareArrows className="size-5" aria-hidden /> {t('Dokumente vergleichen')}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {t('Vorher:')} <strong className="text-foreground">{oldName}</strong>
          </span>
          <span aria-hidden>→</span>
          <span>
            {t('Nachher:')} <strong className="text-foreground">{newName}</strong>
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setSwapped((value) => !value)}
          >
            <ArrowLeftRight /> {t('Tauschen')}
          </Button>
        </DialogDescription>
      </DialogHeader>

      {state.status === 'loading' && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {t('Texte werden verglichen …')}
        </p>
      )}
      {state.status === 'error' && (
        <p className="text-destructive py-6 text-center text-sm" role="alert">
          {state.message}
        </p>
      )}
      {noText && (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {t(
            'In {name} wurde kein Text gefunden. Bei Scans bitte zuerst die Texterkennung ausführen.',
            { name: state.status === 'ready' && state.file.length === 0 ? file.name : name },
          )}
        </p>
      )}
      {result && !noText && (
        <>
          <p className="text-sm" role="status">
            {result.changes.length === 0 ? (
              t('Der Text ist identisch.')
            ) : (
              <>
                <strong>
                  {result.changes.length === 1
                    ? t('1 Änderung')
                    : t('{count} Änderungen', { count: result.changes.length })}
                </strong>
                {' · '}
                <span className="text-red-700 dark:text-red-400">
                  {result.removedWords === 1
                    ? t('1 Wort entfernt')
                    : t('{count} Wörter entfernt', { count: result.removedWords })}
                </span>
                {' · '}
                <span className="text-green-700 dark:text-green-400">
                  {result.addedWords === 1
                    ? t('1 Wort hinzugefügt')
                    : t('{count} Wörter hinzugefügt', { count: result.addedWords })}
                </span>
              </>
            )}
          </p>
          {result.changes.length > 0 && (
            <ol className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1">
              {result.changes.slice(0, MAX_SHOWN).map((change, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className="hover:bg-accent focus-visible:ring-ring flex w-full gap-3 rounded-md border p-2 text-left text-sm focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => show(change)}
                    title={t('In der geöffneten PDF zeigen')}
                  >
                    <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                      {t('S. {page}', { page: currentPage(change) + 1 })}
                    </span>
                    <span className="min-w-0 flex-1 break-words">
                      {change.before && (
                        <span className="text-muted-foreground">{change.before} </span>
                      )}
                      {change.parts.map((part, key) => (
                        <span
                          key={key}
                          className={cn(
                            part.type === 'removed' &&
                              'rounded-sm bg-red-500/15 text-red-800 line-through dark:text-red-300',
                            part.type === 'added' &&
                              'rounded-sm bg-green-500/15 text-green-800 dark:text-green-300',
                          )}
                        >
                          {part.text}{' '}
                        </span>
                      ))}
                      {change.after && (
                        <span className="text-muted-foreground">{change.after}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {result.changes.length > MAX_SHOWN && (
                <li className="text-muted-foreground py-2 text-center text-xs">
                  {t('… und {count} weitere Änderungen', {
                    count: result.changes.length - MAX_SHOWN,
                  })}
                </li>
              )}
            </ol>
          )}
          <p className="text-muted-foreground text-xs">
            {t(
              'Verglichen wird der Text (ohne Formatierung und Bilder). Ein Klick zeigt die Stelle in der geöffneten PDF.',
            )}
          </p>
        </>
      )}
    </DialogContent>
  )
}
