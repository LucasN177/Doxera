import { ImageUp, Type } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
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
import { Input } from '@/components/ui/input'
import { setWatermarks } from '@/engine/document/annotations'
import { resolvePages } from '@/engine/document/pageOps'
import { PageSurface } from '@/features/viewer/PageSurface'
import { pickFiles } from '@/lib/file'
import { prepareImage } from '@/lib/images'
import { cn } from '@/lib/utils'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import type { WatermarkAnnotation } from '@/types/annotations'

type Mode = 'text' | 'image'
type Target = 'all' | 'selected' | 'current'

const COLORS = [
  { value: '#64748b', name: 'Grau' },
  { value: '#dc2626', name: 'Rot' },
  { value: '#1d4ed8', name: 'Blau' },
  { value: '#0f172a', name: 'Schwarz' },
]
const ANGLES = [
  { value: 45, name: 'Aufsteigend' },
  { value: 0, name: 'Waagerecht' },
  { value: -45, name: 'Absteigend' },
]
const PREVIEW_SIZE = 240

export function WatermarkDialog() {
  const open = useUiStore((state) => state.watermarkOpen)
  const setOpen = useUiStore((state) => state.setWatermarkOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <WatermarkDialogContent onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function WatermarkDialogContent({ onDone }: { onDone: () => void }) {
  const document = useDocumentStore((state) => state.document)
  const sources = useDocumentStore((state) => state.sources)
  const assets = useDocumentStore((state) => state.assets)
  const pages = useMemo(
    () => (document ? resolvePages(document.pages, sources) : []),
    [document, sources],
  )
  const current = pages[useViewerStore.getState().currentPage - 1] ?? pages[0]
  const selectedIds = useViewerStore((state) => state.selectedIds)
  const anyWatermark = pages.some((page) =>
    page.ref.annotations?.some((item) => item.type === 'watermark'),
  )

  // Start from the watermark already on the page, if any
  const [initial] = useState(
    () =>
      current?.ref.annotations?.find(
        (item): item is WatermarkAnnotation => item.type === 'watermark',
      ) ?? null,
  )
  const [mode, setMode] = useState<Mode>(initial?.assetId ? 'image' : 'text')
  const [text, setText] = useState(initial?.text || 'VERTRAULICH')
  const [assetId, setAssetId] = useState(initial?.assetId)
  const [color, setColor] = useState(initial?.color ?? COLORS[0].value)
  const [size, setSize] = useState(initial?.size ?? 0.7)
  const [opacity, setOpacity] = useState(initial?.opacity ?? 0.25)
  const [angle, setAngle] = useState(initial?.angle ?? 45)
  const [target, setTarget] = useState<Target>(selectedIds.length > 1 ? 'selected' : 'all')

  const asset = assetId ? assets.get(assetId) : undefined
  const valid = mode === 'text' ? text.trim().length > 0 : asset !== undefined

  const make = (turns: number): WatermarkAnnotation | null => {
    if (!valid) return null
    return {
      id: crypto.randomUUID(),
      type: 'watermark',
      color,
      text: mode === 'text' ? text.trim() : '',
      ...(mode === 'image' && { assetId }),
      size,
      opacity,
      angle,
      turns,
    }
  }

  const preview = (() => {
    if (!current) return null
    const watermark = make(current.turns)
    const others = (current.ref.annotations ?? []).filter((item) => item.type !== 'watermark')
    const annotations = watermark ? [watermark, ...others] : others
    return { ...current, ref: { ...current.ref, annotations } }
  })()

  if (!document || !current || !preview) return null

  const targetIds = (): Set<string> => {
    if (target === 'current') return new Set([current.ref.id])
    if (target === 'selected' && selectedIds.length > 0) return new Set(selectedIds)
    return new Set(pages.map((page) => page.ref.id))
  }

  const pickImage = async () => {
    const [file] = await pickFiles('image/*')
    if (!file) return
    try {
      const image = await prepareImage(file)
      const added = useDocumentStore.getState().addAsset({ id: crypto.randomUUID(), ...image })
      setAssetId(added.id)
      setMode('image')
    } catch {
      toast.error('Das Bild konnte nicht gelesen werden.')
    }
  }

  const apply = () => {
    const ids = targetIds()
    const turnsById = new Map(pages.map((page) => [page.ref.id, page.turns]))
    useDocumentStore
      .getState()
      .edit((list) => setWatermarks(list, ids, (page) => make(turnsById.get(page.id) ?? 0)))
    toast.success(ids.size === 1 ? 'Wasserzeichen gesetzt' : `Wasserzeichen auf ${ids.size} Seiten`)
    onDone()
  }

  const removeAll = () => {
    const ids = new Set(pages.map((page) => page.ref.id))
    useDocumentStore.getState().edit((list) => setWatermarks(list, ids, () => null))
    toast.success('Wasserzeichen entfernt')
    onDone()
  }

  const scale = PREVIEW_SIZE / Math.max(current.size.width, current.size.height)

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Wasserzeichen</DialogTitle>
        <DialogDescription>
          Text oder Bild halbtransparent über die Seiten legen. Ein vorhandenes Wasserzeichen wird
          ersetzt.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex shrink-0 justify-center">
          <div
            className="relative overflow-hidden bg-white shadow-md ring-1 ring-black/10"
            style={{ width: current.size.width * scale, height: current.size.height * scale }}
            aria-label="Vorschau der aktuellen Seite"
            role="img"
          >
            <PageSurface page={preview} scale={scale} showError={false} />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex gap-2" role="radiogroup" aria-label="Art">
            <Choice selected={mode === 'text'} onClick={() => setMode('text')}>
              <Type /> Text
            </Choice>
            <Choice
              selected={mode === 'image'}
              onClick={() => (asset ? setMode('image') : void pickImage())}
            >
              <ImageUp /> Bild
            </Choice>
          </div>

          {mode === 'text' ? (
            <div className="space-y-3">
              <Input
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label="Text des Wasserzeichens"
                maxLength={60}
                className="text-base sm:text-sm"
              />
              <div className="flex gap-2" role="radiogroup" aria-label="Farbe">
                {COLORS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={color === option.value}
                    aria-label={option.name}
                    title={option.name}
                    className={cn(
                      'size-7 rounded-full border border-black/20',
                      color === option.value && 'ring-ring ring-2 ring-offset-2',
                    )}
                    style={{ backgroundColor: option.value }}
                    onClick={() => setColor(option.value)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {asset && (
                <img
                  src={asset.url}
                  alt=""
                  className="h-12 max-w-32 rounded border object-contain"
                />
              )}
              <Button variant="outline" size="sm" onClick={() => void pickImage()}>
                Anderes Bild…
              </Button>
            </div>
          )}

          <Slider
            label="Größe"
            value={size}
            min={0.2}
            max={1}
            step={0.05}
            onChange={setSize}
            format={(value) => `${Math.round(value * 100)} %`}
          />
          <Slider
            label="Deckkraft"
            value={opacity}
            min={0.1}
            max={0.6}
            step={0.05}
            onChange={setOpacity}
            format={(value) => `${Math.round(value * 100)} %`}
          />

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Ausrichtung</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {ANGLES.map((option) => (
                <Choice
                  key={option.value}
                  selected={angle === option.value}
                  onClick={() => setAngle(option.value)}
                >
                  {option.name}
                </Choice>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Seiten</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              <Choice selected={target === 'all'} onClick={() => setTarget('all')}>
                Alle ({pages.length})
              </Choice>
              {selectedIds.length > 0 && (
                <Choice selected={target === 'selected'} onClick={() => setTarget('selected')}>
                  Ausgewählte ({selectedIds.length})
                </Choice>
              )}
              <Choice selected={target === 'current'} onClick={() => setTarget('current')}>
                Aktuelle Seite
              </Choice>
            </div>
          </fieldset>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {anyWatermark ? (
          <Button variant="ghost" onClick={removeAll}>
            Alle entfernen
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2 max-sm:flex-col-reverse">
          <Button variant="outline" onClick={onDone}>
            Abbrechen
          </Button>
          <Button onClick={apply} disabled={!valid}>
            Anwenden
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      role="radio"
      aria-checked={selected}
      variant={selected ? 'secondary' : 'outline'}
      size="sm"
      className={cn(selected && 'ring-ring ring-1')}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format: (value: number) => string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary h-6 w-full"
      />
    </label>
  )
}
