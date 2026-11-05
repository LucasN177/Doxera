import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileArchive,
  Hash,
  Layers,
  Pencil,
  Play,
  Plus,
  ScanText,
  Stamp,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { documentBytes } from '@/features/document/documentBytes'
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
import { Input } from '@/components/ui/input'
import { HEADER_FOOTER_PRESETS } from '@/engine/document/headerFooter'
import { OCR_LANGUAGES } from '@/engine/ocr/tesseract'
import { defaultStep, describeWorkflow, WORKFLOW_TEMPLATES } from '@/engine/workflow/templates'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { saveFilesNow } from '@/lib/deliverFiles'
import { cn } from '@/lib/utils'
import { getPrimarySource, useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { Workflow, WorkflowOutput, WorkflowStep } from '@/types/workflow'
import { runWorkflow } from './runWorkflow'

type View =
  | { type: 'list' }
  | { type: 'edit'; workflow: Workflow }
  | { type: 'run'; workflow: Workflow; progress: number; files?: File[]; note?: string }

const STEP_INFO = {
  ocr: { label: 'Texterkennung', icon: ScanText },
  watermark: { label: 'Wasserzeichen', icon: Stamp },
  compress: { label: 'Komprimieren', icon: FileArchive },
  headerFooter: { label: 'Seitenzahlen', icon: Hash },
} as const

const timestamp = () => Date.now()

type ImageOutput = Extract<WorkflowOutput, { type: 'images' }>
const imageOutput = (output: WorkflowOutput): ImageOutput =>
  output.type === 'images' ? output : { type: 'images', format: 'png', dpi: 150 }

function newWorkflow(template?: Pick<Workflow, 'name' | 'steps' | 'output'>): Workflow {
  const now = timestamp()
  return {
    id: crypto.randomUUID(),
    name: template?.name ?? 'Neuer Workflow',
    steps: template ? structuredClone(template.steps) : [],
    output: template ? structuredClone(template.output) : { type: 'pdf' },
    createdAt: now,
    updatedAt: now,
  }
}

export function WorkflowsDialog() {
  const open = useUiStore((state) => state.workflowsOpen)
  const setOpen = useUiStore((state) => state.setWorkflowsOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <WorkflowsContent onClose={() => setOpen(false)} />}
    </Dialog>
  )
}

function WorkflowsContent({ onClose }: { onClose: () => void }) {
  const workflows = useWorkflowStore((state) => state.workflows)
  const loaded = useWorkflowStore((state) => state.loaded)
  const hasDocument = useDocumentStore((state) => state.document !== null)
  const [view, setView] = useState<View>({ type: 'list' })
  const { open } = useOpenDocument()

  useEffect(() => {
    if (!loaded) void useWorkflowStore.getState().load()
  }, [loaded])

  const save = async (workflow: Workflow) => {
    try {
      await useWorkflowStore.getState().save({ ...workflow, updatedAt: timestamp() })
      setView({ type: 'list' })
      toast.success(`„${workflow.name}“ gespeichert`)
    } catch (error) {
      console.error('Workflow konnte nicht gespeichert werden', error)
      toast.error('Der Workflow konnte nicht gespeichert werden.')
    }
  }

  const remove = async (workflow: Workflow) => {
    await useWorkflowStore.getState().remove(workflow.id)
    toast.success(`„${workflow.name}“ gelöscht`)
  }

  /** Runs on the open document as it would be exported. */
  const runOnDocument = async (workflow: Workflow) => {
    const state = useDocumentStore.getState()
    const document = state.document
    const primary = getPrimarySource(state)
    if (!document || !primary) return
    setView({ type: 'run', workflow, progress: 0 })
    try {
      const data = await documentBytes()
      const result = await runWorkflow(document.name, data, workflow, {
        signal: new AbortController().signal,
        onProgress: (progress) =>
          setView((current) => (current.type === 'run' ? { ...current, progress } : current)),
      })
      setView({ type: 'run', workflow, progress: 1, files: result.files, note: result.note })
    } catch (error) {
      console.error('Workflow fehlgeschlagen', error)
      toast.error('Der Workflow ist fehlgeschlagen.')
      setView({ type: 'list' })
    }
  }

  const runOnFiles = (workflow: Workflow) => {
    const ui = useUiStore.getState()
    ui.setBatchWorkflowId(workflow.id)
    ui.setBatchFiles(ui.batchFiles ?? [])
    onClose()
  }

  if (view.type === 'edit') {
    return (
      <WorkflowEditor
        workflow={view.workflow}
        onCancel={() => setView({ type: 'list' })}
        onSave={(workflow) => void save(workflow)}
      />
    )
  }

  if (view.type === 'run') {
    const done = view.files !== undefined
    const pdf = done && view.workflow.output.type === 'pdf' && view.files!.length === 1
    return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{view.workflow.name}</DialogTitle>
          <DialogDescription>{describeWorkflow(view.workflow)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2" aria-live="polite">
          <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar">
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${view.progress * 100}%` }}
            />
          </div>
          <p className="text-sm">
            {done
              ? view.files!.length > 0
                ? `Fertig: ${view.note}`
                : `Kein Ergebnis: ${view.note}`
              : 'Wird ausgeführt …'}
          </p>
        </div>
        {done && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setView({ type: 'list' })}>
              Zurück
            </Button>
            {pdf && (
              <Button
                variant="outline"
                onClick={() => void open(view.files![0]).then((ok) => ok && onClose())}
              >
                Öffnen
              </Button>
            )}
            {view.files!.length > 0 && (
              <Button
                onClick={() =>
                  void saveFilesNow(view.files!, view.workflow.name).catch((error: unknown) => {
                    if ((error as Error).name !== 'AbortError') {
                      toast.error('Die Ergebnisse konnten nicht gespeichert werden.')
                    }
                  })
                }
              >
                Speichern
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    )
  }

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Workflows</DialogTitle>
        <DialogDescription>
          Wiederverwendbare Abläufe aus mehreren Schritten – auf das offene Dokument oder viele
          Dateien auf einmal anwenden. Sie werden lokal in diesem Browser gespeichert.
        </DialogDescription>
      </DialogHeader>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Meine Workflows</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setView({ type: 'edit', workflow: newWorkflow() })}
          >
            <Plus /> Neu
          </Button>
        </div>
        {workflows.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            Noch keine eigenen Workflows – lege einen neuen an oder übernimm eine Vorlage.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {workflows.map((workflow) => (
              <li key={workflow.id} className="flex items-center gap-2 rounded-md border p-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{workflow.name}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {describeWorkflow(workflow)}
                  </span>
                </span>
                {hasDocument && (
                  <IconButton
                    label="Auf dieses Dokument anwenden"
                    onClick={() => void runOnDocument(workflow)}
                  >
                    <Play />
                  </IconButton>
                )}
                <IconButton
                  label="Auf mehrere Dateien anwenden"
                  onClick={() => runOnFiles(workflow)}
                >
                  <Layers />
                </IconButton>
                <IconButton
                  label="Bearbeiten"
                  onClick={() => setView({ type: 'edit', workflow: structuredClone(workflow) })}
                >
                  <Pencil />
                </IconButton>
                <IconButton
                  label="Duplizieren"
                  onClick={() =>
                    setView({
                      type: 'edit',
                      workflow: newWorkflow({ ...workflow, name: `${workflow.name} (Kopie)` }),
                    })
                  }
                >
                  <Copy />
                </IconButton>
                <IconButton label="Löschen" onClick={() => void remove(workflow)}>
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Vorlagen</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {WORKFLOW_TEMPLATES.map((template) => (
            <li key={template.name}>
              <button
                type="button"
                className="hover:bg-accent h-full w-full rounded-md border p-2.5 text-left"
                onClick={() => setView({ type: 'edit', workflow: newWorkflow(template) })}
              >
                <span className="block text-sm font-medium">{template.name}</span>
                <span className="text-muted-foreground block text-xs">{template.description}</span>
                <span className="text-primary mt-1 block text-xs">
                  {describeWorkflow(template)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Schließen
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: ReadonlyArray<readonly [T, string]>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={label}>
      {options.map(([option, name]) => (
        <Button
          key={String(option)}
          size="sm"
          role="radio"
          aria-checked={value === option}
          variant={value === option ? 'secondary' : 'outline'}
          className={cn('h-7 px-2 text-xs', value === option && 'ring-ring ring-1')}
          onClick={() => onChange(option)}
        >
          {name}
        </Button>
      ))}
    </div>
  )
}

function StepOptions({
  step,
  onChange,
}: {
  step: WorkflowStep
  onChange: (step: WorkflowStep) => void
}): ReactNode {
  if (step.type === 'compress') {
    return (
      <Choice
        label="Stufe"
        value={step.level}
        onChange={(level) => onChange({ ...step, level })}
        options={[
          ['medium', 'Ausgewogen'],
          ['strong', 'Stark'],
          ['lossless', 'Verlustfrei'],
        ]}
      />
    )
  }
  if (step.type === 'headerFooter') {
    const { settings } = step
    const preset = HEADER_FOOTER_PRESETS.findIndex(
      (item) =>
        item.header.join('|') === settings.header.join('|') &&
        item.footer.join('|') === settings.footer.join('|'),
    )
    return (
      <div className="space-y-1.5">
        <Choice
          label="Layout"
          value={preset}
          onChange={(index) => {
            const { header, footer } = HEADER_FOOTER_PRESETS[index]!
            onChange({ ...step, settings: { ...settings, header, footer } })
          }}
          options={HEADER_FOOTER_PRESETS.map((item, index) => [index, item.name] as const)}
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-primary size-3.5"
            checked={settings.skipFirstPage}
            onChange={(event) =>
              onChange({ ...step, settings: { ...settings, skipFirstPage: event.target.checked } })
            }
          />
          Nicht auf der ersten Seite (Deckblatt)
        </label>
      </div>
    )
  }
  if (step.type === 'ocr') {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {OCR_LANGUAGES.map(({ code, name }) => {
            const selected = step.languages.includes(code)
            return (
              <Button
                key={code}
                size="sm"
                aria-pressed={selected}
                variant={selected ? 'secondary' : 'outline'}
                className={cn('h-7 px-2 text-xs', selected && 'ring-ring ring-1')}
                onClick={() =>
                  onChange({
                    ...step,
                    languages: selected
                      ? step.languages.filter((item) => item !== code)
                      : [...step.languages, code],
                  })
                }
              >
                {name}
              </Button>
            )
          })}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            className="accent-primary size-3.5"
            checked={step.skipPagesWithText}
            onChange={(event) => onChange({ ...step, skipPagesWithText: event.target.checked })}
          />
          Seiten mit vorhandenem Text überspringen
        </label>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <Input
        value={step.text}
        maxLength={60}
        aria-label="Text des Wasserzeichens"
        className="h-8 text-base sm:text-sm"
        onChange={(event) => onChange({ ...step, text: event.target.value })}
      />
      <Choice
        label="Ausrichtung"
        value={step.angle}
        onChange={(angle) => onChange({ ...step, angle })}
        options={[
          [45, 'Aufsteigend'],
          [0, 'Waagerecht'],
          [-45, 'Absteigend'],
        ]}
      />
      <Choice
        label="Farbe"
        value={step.color}
        onChange={(color) => onChange({ ...step, color })}
        options={[
          ['#64748b', 'Grau'],
          ['#dc2626', 'Rot'],
          ['#1d4ed8', 'Blau'],
        ]}
      />
    </div>
  )
}

function WorkflowEditor({
  workflow,
  onCancel,
  onSave,
}: {
  workflow: Workflow
  onCancel: () => void
  onSave: (workflow: Workflow) => void
}) {
  const [draft, setDraft] = useState(workflow)
  const setSteps = (steps: WorkflowStep[]) => setDraft((current) => ({ ...current, steps }))
  const setOutput = (output: WorkflowOutput) => setDraft((current) => ({ ...current, output }))
  const move = (index: number, delta: number) => {
    const steps = [...draft.steps]
    const [step] = steps.splice(index, 1)
    steps.splice(index + delta, 0, step)
    setSteps(steps)
  }
  const invalid =
    !draft.name.trim() ||
    draft.steps.some(
      (step) =>
        (step.type === 'ocr' && step.languages.length === 0) ||
        (step.type === 'watermark' && !step.text.trim()),
    ) ||
    (draft.steps.length === 0 && draft.output.type === 'pdf')

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Workflow bearbeiten</DialogTitle>
        <DialogDescription>{describeWorkflow(draft)}</DialogDescription>
      </DialogHeader>

      <Input
        value={draft.name}
        maxLength={60}
        aria-label="Name"
        className="text-base sm:text-sm"
        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Schritte</h3>
        {draft.steps.length === 0 && (
          <p className="text-muted-foreground text-xs">Noch keine Schritte.</p>
        )}
        <ol className="space-y-2">
          {draft.steps.map((step, index) => {
            const { label, icon: Icon } = STEP_INFO[step.type]
            return (
              <li key={index} className="space-y-2 rounded-md border p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-4 text-xs tabular-nums">
                    {index + 1}.
                  </span>
                  <Icon className="size-4" aria-hidden />
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  <IconButton
                    label="Nach oben"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    label="Nach unten"
                    disabled={index === draft.steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    label="Schritt entfernen"
                    onClick={() => setSteps(draft.steps.filter((_, other) => other !== index))}
                  >
                    <X />
                  </IconButton>
                </div>
                <div className="pl-6">
                  <StepOptions
                    step={step}
                    onChange={(next) =>
                      setSteps(draft.steps.map((item, other) => (other === index ? next : item)))
                    }
                  />
                </div>
              </li>
            )
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STEP_INFO) as Array<WorkflowStep['type']>).map((type) => {
            const { label, icon: Icon } = STEP_INFO[type]
            return (
              <Button
                key={type}
                size="sm"
                variant="outline"
                onClick={() => setSteps([...draft.steps, defaultStep(type)])}
              >
                <Plus /> <Icon /> {label}
              </Button>
            )
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Ausgabe</h3>
        <Choice
          label="Ausgabe"
          value={draft.output.type}
          onChange={(type) =>
            setOutput(
              type === 'pdf'
                ? { type }
                : type === 'images'
                  ? { type, format: 'png', dpi: 150 }
                  : { type, format: 'xlsx' },
            )
          }
          options={[
            ['pdf', 'PDF'],
            ['images', 'Bilder'],
            ['data', 'Daten'],
          ]}
        />
        {draft.output.type === 'images' && (
          <div className="flex flex-wrap gap-3">
            <Choice
              label="Format"
              value={draft.output.format}
              onChange={(format) =>
                setOutput({ type: 'images', format, dpi: imageOutput(draft.output).dpi })
              }
              options={[
                ['png', 'PNG'],
                ['jpeg', 'JPEG'],
              ]}
            />
            <Choice
              label="Auflösung"
              value={draft.output.dpi}
              onChange={(dpi) =>
                setOutput({ type: 'images', format: imageOutput(draft.output).format, dpi })
              }
              options={[
                [72, '72 dpi'],
                [150, '150 dpi'],
                [300, '300 dpi'],
              ]}
            />
          </div>
        )}
        {draft.output.type === 'data' && (
          <Choice
            label="Format"
            value={draft.output.format}
            onChange={(format) => setOutput({ type: 'data', format })}
            options={[
              ['xlsx', 'Excel'],
              ['json', 'JSON'],
              ['csv', 'CSV'],
            ]}
          />
        )}
      </section>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button onClick={() => onSave({ ...draft, name: draft.name.trim() })} disabled={invalid}>
          Speichern
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
