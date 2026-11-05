import { FileStack } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { partFileName, splitPages, type SplitMode } from '@/engine/document/split'
import { useExportDocument } from '@/hooks/useExportDocument'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import type { PageRef } from '@/types/document'
import { t } from '@/i18n'

type Kind = SplitMode['kind']

const PREVIEW_LIMIT = 6
const NO_PAGES: PageRef[] = []

export function SplitDialog() {
  const open = useUiStore((state) => state.pageDialog === 'split')
  const close = useUiStore((state) => state.closePageDialog)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {open && <SplitDialogContent onDone={close} />}
    </Dialog>
  )
}

function SplitDialogContent({ onDone }: { onDone: () => void }) {
  const document = useDocumentStore((state) => state.document)
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const { exportParts, savesViaShareSheet } = useExportDocument()
  const pages = document?.pages ?? NO_PAGES

  // Split at the selection only makes sense if a selected page isn't the first one
  const selectionUsable = selectedIds.some((id) => pages.findIndex((p) => p.id === id) > 0)
  const [kind, setKind] = useState<Kind>(selectionUsable ? 'before' : 'every')
  const [size, setSize] = useState(() => String(Math.max(1, Math.ceil(pages.length / 2))))
  const sizeNumber = Math.max(1, Math.min(pages.length, Number.parseInt(size, 10) || 1))
  const id = useId()

  const parts = useMemo(() => {
    const mode: SplitMode =
      kind === 'every'
        ? { kind, size: sizeNumber }
        : kind === 'before'
          ? { kind, ids: new Set(selectedIds) }
          : { kind }
    return splitPages(pages, mode)
  }, [kind, sizeNumber, selectedIds, pages])

  if (!document) return null

  const submit = () => {
    const base = document.name.replace(/\.pdf$/i, '')
    void exportParts(
      parts.map((part) => ({ name: partFileName(document.name, part), pages: part.pages })),
      `${base} (aufgeteilt)`,
    )
    onDone()
  }

  const option = (value: Kind, label: ReactNode, disabled = false, hint?: string) => (
    <label
      className={`flex items-start gap-2.5 rounded-md border p-3 text-sm ${
        disabled ? 'opacity-50' : 'hover:bg-accent/50 cursor-pointer'
      } ${kind === value ? 'border-primary bg-primary/5' : ''}`}
    >
      <input
        type="radio"
        name={`${id}-split`}
        className="accent-primary mt-0.5"
        checked={kind === value}
        disabled={disabled}
        onChange={() => setKind(value)}
      />
      <span className="space-y-0.5">
        <span className="block">{label}</span>
        {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
      </span>
    </label>
  )

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t('PDF aufteilen')}</DialogTitle>
        <DialogDescription>
          {t(
            'Erstellt aus „{name}“ ({count} Seiten) mehrere PDF-Dateien. Das Dokument selbst bleibt unverändert.',
            { name: document.name, count: pages.length },
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2" role="radiogroup" aria-label={t('Aufteilen nach')}>
        {option(
          'every',
          <span className="flex items-center gap-2">
            {t('Alle')}
            <Input
              type="number"
              min={1}
              max={pages.length}
              inputMode="numeric"
              aria-label={t('Seiten pro Datei')}
              className="h-7 w-16 px-2"
              value={size}
              onFocus={() => setKind('every')}
              onChange={(event) => setSize(event.target.value)}
            />
            {t('Seiten eine neue Datei')}
          </span>,
        )}
        {option(
          'before',
          t('Vor jeder ausgewählten Seite'),
          !selectionUsable,
          selectionUsable
            ? t('Jede ausgewählte Seite beginnt eine neue Datei.')
            : t(
                'Wähle in der Seitenleiste die Seiten aus, mit denen eine neue Datei beginnen soll.',
              ),
        )}
        {option('single', t('Jede Seite als eigene Datei'))}
      </div>

      <div className="bg-muted/50 rounded-md p-3 text-sm">
        <p className="mb-1.5 flex items-center gap-1.5 font-medium">
          <FileStack className="size-4" aria-hidden />
          {parts.length === 1
            ? t('Ergibt 1 Datei')
            : t('Ergibt {count} Dateien', { count: parts.length })}
        </p>
        <ul className="text-muted-foreground space-y-0.5 text-xs">
          {parts.slice(0, PREVIEW_LIMIT).map((part) => (
            <li key={part.first} className="truncate">
              {partFileName(document.name, part)}
            </li>
          ))}
          {parts.length > PREVIEW_LIMIT && (
            <li>{t('… und {count} weitere', { count: parts.length - PREVIEW_LIMIT })}</li>
          )}
        </ul>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t('Abbrechen')}
        </Button>
        <Button onClick={submit} disabled={parts.length < 2}>
          {savesViaShareSheet ? t('Aufteilen und sichern') : t('Aufteilen und speichern')}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
