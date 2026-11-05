import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  FileArchive,
  FileImage,
  FilePlus2,
  FileSpreadsheet,
  Layers,
  Workflow,
  Loader2,
  ScanText,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import type { DataFormat } from '@/engine/export/dataFiles'
import type { CompressionLevel } from '@/engine/mupdf/compress'
import { OCR_LANGUAGES, type OcrLanguage } from '@/engine/ocr/tesseract'
import type { ImageFormat } from '@/features/convert/renderImages'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { saveFilesNow, uniqueFileNames } from '@/lib/deliverFiles'
import { formatFileSize } from '@/lib/file'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/uiStore'
import { pickBatchFiles } from './pickBatchFiles'
import { mergeFiles, processFile, type BatchAction } from './processors'
import { describeWorkflow } from '@/engine/workflow/templates'
import { useWorkflowStore } from '@/stores/workflowStore'
import { t } from '@/i18n'

type ActionType = BatchAction['type']
type Status = 'waiting' | 'running' | 'done' | 'skipped' | 'error'

interface Item {
  file: File
  status: Status
  note?: string
  progress?: number
}

const ACTIONS: Array<{ type: ActionType; label: string; hint: string; icon: typeof Layers }> = [
  { type: 'compress', label: t('Komprimieren'), hint: t('Dateien verkleinern'), icon: FileArchive },
  { type: 'ocr', label: t('Texterkennung'), hint: t('Scans durchsuchbar machen'), icon: ScanText },
  { type: 'images', label: t('Als Bilder'), hint: t('Jede Seite als Bild'), icon: FileImage },
  { type: 'data', label: t('Daten'), hint: t('Text und Tabellen'), icon: FileSpreadsheet },
  { type: 'merge', label: t('Zusammenführen'), hint: t('Eine PDF aus allen'), icon: Layers },
  { type: 'workflow', label: t('Workflow'), hint: t('Gespeicherte Schrittkette'), icon: Workflow },
]

export function BatchDialog() {
  const files = useUiStore((state) => state.batchFiles)
  const setFiles = useUiStore((state) => state.setBatchFiles)
  const running = useRef<AbortController | null>(null)
  const close = () => {
    running.current?.abort()
    setFiles(null)
  }
  return (
    <Dialog open={files !== null} onOpenChange={(open) => !open && close()}>
      {files && (
        <BatchContent
          files={files}
          onRun={(controller) => {
            running.current = controller
          }}
          onClose={close}
        />
      )}
    </Dialog>
  )
}

function Choices<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      <span className="text-muted-foreground w-20 text-xs">{label}</span>
      {options.map(([option, name]) => (
        <Button
          key={String(option)}
          size="sm"
          role="radio"
          aria-checked={value === option}
          variant={value === option ? 'secondary' : 'outline'}
          className={cn(value === option && 'ring-ring ring-1')}
          onClick={() => onChange(option)}
        >
          {name}
        </Button>
      ))}
    </div>
  )
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'running') return <Loader2 className="text-primary size-4 animate-spin" />
  if (status === 'done') return <CheckCircle2 className="size-4 text-green-600" />
  if (status === 'error') return <XCircle className="text-destructive size-4" />
  if (status === 'skipped') return <Circle className="text-muted-foreground size-4" />
  return <Circle className="text-muted-foreground/40 size-4" />
}

function BatchContent({
  files,
  onRun,
  onClose,
}: {
  files: File[]
  onRun: (controller: AbortController | null) => void
  onClose: () => void
}) {
  const workflows = useWorkflowStore((state) => state.workflows)
  const workflowsLoaded = useWorkflowStore((state) => state.loaded)
  const presetWorkflow = useUiStore((state) => state.batchWorkflowId)
  const [type, setType] = useState<ActionType>(presetWorkflow ? 'workflow' : 'compress')
  const [workflowId, setWorkflowId] = useState<string | null>(presetWorkflow)
  const workflow = workflows.find((item) => item.id === workflowId) ?? workflows[0] ?? null

  useEffect(() => {
    if (!workflowsLoaded) void useWorkflowStore.getState().load()
    // The preset is used once
    useUiStore.getState().setBatchWorkflowId(null)
  }, [workflowsLoaded])
  const [level, setLevel] = useState<CompressionLevel>('medium')
  const [languages, setLanguages] = useState<OcrLanguage[]>(['deu', 'eng'])
  const [skipText, setSkipText] = useState(true)
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png')
  const [dpi, setDpi] = useState(150)
  const [dataFormat, setDataFormat] = useState<DataFormat>('xlsx')
  const [phase, setPhase] = useState<'setup' | 'running' | 'done'>('setup')
  const [items, setItems] = useState<Item[]>([])
  const [results, setResults] = useState<File[]>([])
  const { open } = useOpenDocument()

  const setFiles = (next: File[]) => useUiStore.getState().setBatchFiles(next)
  const shown: Item[] =
    phase === 'setup' ? files.map((file) => ({ file, status: 'waiting' })) : items
  const update = (index: number, change: Partial<Item>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)))

  const action = (): BatchAction => {
    switch (type) {
      case 'compress':
        return { type, level }
      case 'ocr':
        return { type, languages, skipPagesWithText: skipText }
      case 'images':
        return { type, format: imageFormat, dpi }
      case 'data':
        return { type, format: dataFormat }
      case 'merge':
        return { type }
      case 'workflow':
        return { type, workflow: workflow! }
    }
  }

  const run = async () => {
    const controller = new AbortController()
    onRun(controller)
    setItems(files.map((file) => ({ file, status: 'waiting' })))
    setResults([])
    setPhase('running')
    const chosen = action()
    const output: File[] = []
    try {
      if (chosen.type === 'merge') {
        setItems(files.map((file) => ({ file, status: 'running' })))
        const merged = await mergeFiles(
          files,
          (index, error) =>
            update(index, error ? { status: 'error', note: error.message } : { status: 'done' }),
          controller.signal,
        )
        if (merged) output.push(merged)
      } else {
        for (const [index, file] of files.entries()) {
          if (controller.signal.aborted) break
          update(index, { status: 'running', progress: 0 })
          try {
            const result = await processFile(file, chosen, {
              signal: controller.signal,
              onProgress: (progress) => update(index, { progress }),
            })
            output.push(...result.files)
            update(index, {
              status: result.files.length > 0 ? 'done' : 'skipped',
              note: result.note,
              progress: 1,
            })
          } catch (error) {
            if ((error as Error).name === 'AbortError') {
              update(index, { status: 'skipped', note: t('Abgebrochen') })
              break
            }
            console.error(`Stapelverarbeitung: ${file.name}`, error)
            update(index, {
              status: 'error',
              note: (error as Error).message || t('Fehlgeschlagen'),
            })
          }
        }
      }
      if (controller.signal.aborted) toast.info(t('Stapelverarbeitung abgebrochen'))
    } finally {
      onRun(null)
      setResults(uniqueFileNames(output))
      setPhase('done')
    }
  }

  const save = async () => {
    try {
      await saveFilesNow(results, type === 'merge' ? t('Zusammengeführt') : t('Doxera Ergebnisse'))
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      console.error('Speichern fehlgeschlagen', error)
      toast.error(t('Die Ergebnisse konnten nicht gespeichert werden.'))
    }
  }

  const move = (index: number, delta: number) => {
    const next = [...files]
    const [file] = next.splice(index, 1)
    next.splice(index + delta, 0, file)
    setFiles(next)
  }

  const finished = items.filter((item) => item.status === 'done').length
  const failed = items.filter((item) => item.status === 'error').length
  const overall =
    items.length > 0
      ? items.reduce(
          (sum, item) =>
            sum +
            (item.status === 'running' ? (item.progress ?? 0) : item.status === 'waiting' ? 0 : 1),
          0,
        ) / items.length
      : 0

  let options: ReactNode = null
  if (type === 'compress') {
    options = (
      <Choices
        label={t('Stufe')}
        value={level}
        onChange={setLevel}
        options={[
          ['medium', t('Ausgewogen (150 dpi)')],
          ['strong', t('Stark (96 dpi)')],
          ['lossless', t('Verlustfrei')],
        ]}
      />
    )
  } else if (type === 'ocr') {
    options = (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground w-20 text-xs">{t('Sprachen')}</span>
          {OCR_LANGUAGES.map(({ code, name }) => {
            const selected = languages.includes(code)
            return (
              <Button
                key={code}
                size="sm"
                aria-pressed={selected}
                variant={selected ? 'secondary' : 'outline'}
                className={cn(selected && 'ring-ring ring-1')}
                onClick={() =>
                  setLanguages((current) =>
                    selected ? current.filter((item) => item !== code) : [...current, code],
                  )
                }
              >
                {name}
              </Button>
            )
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={skipText}
            onChange={(event) => setSkipText(event.target.checked)}
          />
          {t('Seiten mit vorhandenem Text überspringen')}
        </label>
      </div>
    )
  } else if (type === 'images') {
    options = (
      <div className="space-y-2">
        <Choices
          label={t('Format')}
          value={imageFormat}
          onChange={setImageFormat}
          options={[
            ['png', 'PNG'],
            ['jpeg', 'JPEG'],
          ]}
        />
        <Choices
          label={t('Auflösung')}
          value={dpi}
          onChange={setDpi}
          options={[
            [72, t('72 dpi')],
            [150, t('150 dpi')],
            [300, t('300 dpi')],
          ]}
        />
      </div>
    )
  } else if (type === 'data') {
    options = (
      <Choices
        label={t('Format')}
        value={dataFormat}
        onChange={setDataFormat}
        options={[
          ['xlsx', t('Excel')],
          ['json', 'JSON'],
          ['csv', 'CSV'],
        ]}
      />
    )
  } else if (type === 'workflow') {
    options = workflow ? (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground w-20 text-xs">{t('Workflow')}</span>
        <select
          aria-label={t('Workflow')}
          className="border-input bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-sm"
          value={workflow.id}
          onChange={(event) => setWorkflowId(event.target.value)}
        >
          {workflows.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} – {describeWorkflow(item)}
            </option>
          ))}
        </select>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground text-xs">{t('Noch keine Workflows gespeichert.')}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onClose()
            useUiStore.getState().setWorkflowsOpen(true)
          }}
        >
          {t('Workflows anlegen')}
        </Button>
      </div>
    )
  } else {
    options = (
      <p className="text-muted-foreground text-xs">
        {t(
          'Alle Dateien werden in der Reihenfolge der Liste zu einer PDF verbunden; Bilder werden A4-Seiten.',
        )}
      </p>
    )
  }

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t('Stapelverarbeitung')}</DialogTitle>
        <DialogDescription>
          {t('Eine Aktion für mehrere Dateien auf einmal – nacheinander und lokal im Browser.')}
        </DialogDescription>
      </DialogHeader>

      <ol className="max-h-56 space-y-1 overflow-y-auto">
        {shown.map((item, index) => (
          <li
            key={`${item.file.name}-${index}`}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5"
          >
            <StatusIcon status={item.status} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{item.file.name}</span>
              <span
                className={cn(
                  'text-muted-foreground block truncate text-xs',
                  item.status === 'error' && 'text-destructive',
                )}
              >
                {item.note ??
                  (item.status === 'running'
                    ? `${Math.round((item.progress ?? 0) * 100)} %`
                    : formatFileSize(item.file.size))}
              </span>
            </span>
            {phase === 'setup' && (
              <>
                {type === 'merge' && (
                  <>
                    <IconButton
                      label={t('Nach oben')}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      label={t('Nach unten')}
                      disabled={index === files.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                  </>
                )}
                <IconButton
                  label={t('Entfernen')}
                  onClick={() => setFiles(files.filter((_, other) => other !== index))}
                >
                  <X />
                </IconButton>
              </>
            )}
          </li>
        ))}
        {shown.length === 0 && (
          <li className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {t('Noch keine Dateien – PDFs oder Bilder hinzufügen oder hierher ziehen.')}
          </li>
        )}
      </ol>

      {phase === 'setup' && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void pickBatchFiles()}
          >
            <FilePlus2 /> {t('Dateien hinzufügen')}
          </Button>
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label={t('Aktion')}
          >
            {ACTIONS.map(({ type: value, label, hint, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={type === value}
                className={cn(
                  'hover:bg-accent rounded-md border p-2 text-left',
                  type === value && 'border-primary ring-primary ring-1',
                )}
                onClick={() => setType(value)}
              >
                <Icon className="mb-1 size-4" aria-hidden />
                <span className="block text-sm font-medium">{label}</span>
                <span className="text-muted-foreground block text-xs">{hint}</span>
              </button>
            ))}
          </div>
          {options}
        </>
      )}

      {phase !== 'setup' && (
        <div className="space-y-2" aria-live="polite">
          <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar">
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${overall * 100}%` }}
            />
          </div>
          {phase === 'done' && (
            <p className="text-sm">
              {t('{finished} von {total} verarbeitet', { finished, total: items.length })}
              {failed > 0 && t(', {failed} mit Fehler', { failed })} –{' '}
              {results.length === 1
                ? t('1 Ergebnis.')
                : t('{count} Ergebnisse.', { count: results.length })}
            </p>
          )}
        </div>
      )}

      <DialogFooter className="gap-2">
        {phase === 'setup' && (
          <>
            <Button variant="outline" onClick={onClose}>
              {t('Abbrechen')}
            </Button>
            <Button
              onClick={() => void run()}
              disabled={
                files.length === 0 ||
                (type === 'ocr' && languages.length === 0) ||
                (type === 'merge' && files.length < 2) ||
                (type === 'workflow' && !workflow)
              }
            >
              {files.length === 1
                ? t('1 Datei verarbeiten')
                : t('{count} Dateien verarbeiten', { count: files.length })}
            </Button>
          </>
        )}
        {phase === 'running' && (
          <Button variant="outline" onClick={onClose}>
            {t('Abbrechen')}
          </Button>
        )}
        {phase === 'done' && (
          <>
            <Button variant="outline" onClick={() => setPhase('setup')}>
              {t('Neue Aktion')}
            </Button>
            {type === 'merge' && results.length === 1 && (
              <Button
                variant="outline"
                onClick={() => void open(results[0]).then((ok) => ok && onClose())}
              >
                {t('Öffnen')}
              </Button>
            )}
            <Button onClick={() => void save()} disabled={results.length === 0}>
              {results.length > 1
                ? t('{length} Dateien speichern', { length: results.length })
                : t('Speichern')}
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  )
}
