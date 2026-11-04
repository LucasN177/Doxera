import { Eraser, ImageUp, PenLine, Trash2, Type } from 'lucide-react'
import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from 'react'
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
import { pickFiles } from '@/lib/file'
import { canvasToPng, removeWhiteBackground, trimCanvas, type PreparedImage } from '@/lib/images'
import { cn } from '@/lib/utils'
import type { StoredSignature } from '@/storage/db'
import { deleteSignature, listSignatures, saveSignature } from '@/storage/signatures'
import { useLibraryStore } from '@/stores/libraryStore'
import { useUiStore } from '@/stores/uiStore'
import { insertImage } from './insertImage'

type Mode = 'draw' | 'type' | 'image'

const INK_COLORS = [
  { value: '#0f172a', name: 'Schwarz' },
  { value: '#1d4ed8', name: 'Blau' },
]
const SCRIPT_FONTS = [
  {
    value: '"Segoe Script", "Snell Roundhand", "Brush Script MT", cursive',
    name: 'Schreibschrift',
  },
  { value: '"Bradley Hand", "Comic Sans MS", "Segoe Print", cursive', name: 'Handschrift' },
  { value: 'Georgia, "Times New Roman", serif', name: 'Klassisch' },
]

export function SignatureDialog() {
  const open = useUiStore((state) => state.signatureOpen)
  const setOpen = useUiStore((state) => state.setSignatureOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open && <SignatureDialogContent onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function SignatureDialogContent({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('draw')
  const [color, setColor] = useState(INK_COLORS[0].value)
  const [name, setName] = useState('')
  const [font, setFont] = useState(SCRIPT_FONTS[0].value)
  const [uploaded, setUploaded] = useState<HTMLCanvasElement | null>(null)
  const [hasInk, setHasInk] = useState(false)
  const [remember, setRemember] = useState(true)
  const [saved, setSaved] = useState<StoredSignature[]>([])
  const storageAvailable = useLibraryStore((state) => state.available)
  const padRef = useRef<SignaturePadHandle>(null)

  useEffect(() => {
    listSignatures()
      .then(setSaved)
      .catch(() => setSaved([]))
  }, [])

  const insertPrepared = (image: PreparedImage) => {
    insertImage(image, { signature: true })
    onDone()
  }

  const insertSaved = (signature: StoredSignature) =>
    insertPrepared({
      mimeType: 'image/png',
      data: new Uint8Array(signature.data),
      width: signature.width,
      height: signature.height,
    })

  const removeSaved = async (id: string) => {
    await deleteSignature(id)
    setSaved((list) => list.filter((signature) => signature.id !== id))
  }

  /** The current signature as trimmed canvas, or null if empty. */
  const currentCanvas = (): HTMLCanvasElement | null => {
    if (mode === 'draw') return padRef.current?.export() ?? null
    if (mode === 'type') return name.trim() ? renderTyped(name.trim(), font, color) : null
    return uploaded ? trimCanvas(uploaded) : null
  }

  const canInsert = mode === 'draw' ? hasInk : mode === 'type' ? !!name.trim() : !!uploaded

  const insert = async () => {
    const canvas = currentCanvas()
    if (!canvas) return
    const image = await canvasToPng(canvas)
    if (remember && storageAvailable) {
      try {
        await saveSignature({ id: crypto.randomUUID(), createdAt: Date.now(), ...image })
      } catch (error) {
        console.warn('Signatur konnte nicht gespeichert werden', error)
        toast.warning('Die Signatur wurde eingefügt, aber nicht gespeichert.')
      }
    }
    insertPrepared(image)
  }

  const upload = async () => {
    const [file] = await pickFiles('image/*')
    if (!file) return
    try {
      const bitmap = await createImageBitmap(file)
      // Signatures don't need more than this; keeps the PDF small
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      removeWhiteBackground(canvas)
      setUploaded(canvas)
    } catch {
      toast.error('Das Bild konnte nicht geladen werden.')
    }
  }

  const tab = (value: Mode, label: string, Icon: typeof PenLine) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
        mode === value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => setMode(value)}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  )

  return (
    <DialogContent className="max-h-[95svh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Signatur einfügen</DialogTitle>
        <DialogDescription>
          Die Signatur wird auf der aktuellen Seite unten rechts eingefügt und lässt sich danach
          verschieben und skalieren.
        </DialogDescription>
      </DialogHeader>

      {saved.length > 0 && (
        <section aria-label="Gespeicherte Signaturen" className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-medium">Gespeicherte Signaturen</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {saved.map((signature) => (
              <li key={signature.id} className="group relative">
                <button
                  type="button"
                  className="hover:border-primary flex h-16 w-full items-center justify-center rounded-md border bg-white p-1"
                  onClick={() => insertSaved(signature)}
                  aria-label="Gespeicherte Signatur einfügen"
                >
                  <SavedSignatureImage signature={signature} />
                </button>
                <IconButton
                  label="Gespeicherte Signatur löschen"
                  className="bg-background/90 absolute top-1 right-1 size-6 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  onClick={() => void removeSaved(signature.id)}
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div
        role="tablist"
        aria-label="Art der Signatur"
        className="bg-muted flex gap-1 rounded-lg p-1"
      >
        {tab('draw', 'Zeichnen', PenLine)}
        {tab('type', 'Tippen', Type)}
        {tab('image', 'Bild', ImageUp)}
      </div>

      {mode !== 'image' && (
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Tintenfarbe">
          <span className="text-muted-foreground text-xs">Farbe</span>
          {INK_COLORS.map(({ value, name: label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={color === value}
              aria-label={label}
              className={cn(
                'size-6 rounded-full border border-black/20',
                color === value && 'ring-ring ring-2 ring-offset-1',
              )}
              style={{ backgroundColor: value }}
              onClick={() => setColor(value)}
            />
          ))}
        </div>
      )}

      {mode === 'draw' && (
        <div className="space-y-1">
          <SignaturePad ref={padRef} color={color} onInkChange={setHasInk} />
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>Mit Maus, Finger oder Stift unterschreiben</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => padRef.current?.clear()}
              disabled={!hasInk}
            >
              <Eraser />
              Löschen
            </Button>
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div className="space-y-2">
          <Input
            aria-label="Name"
            placeholder="Vor- und Nachname"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
          <div className="grid gap-1.5" role="radiogroup" aria-label="Schriftart">
            {SCRIPT_FONTS.map(({ value, name: label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={font === value}
                aria-label={label}
                className={cn(
                  'truncate rounded-md border bg-white px-3 py-2 text-left text-2xl',
                  font === value && 'border-primary ring-primary/30 ring-2',
                )}
                style={{ fontFamily: value, color }}
                onClick={() => setFont(value)}
              >
                {name.trim() || 'Ihre Signatur'}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'image' && (
        <div className="space-y-2">
          {uploaded ? (
            <div className="flex h-40 items-center justify-center rounded-md border bg-white p-2">
              <img
                src={uploaded.toDataURL()}
                alt="Vorschau der Signatur"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
              Foto oder Scan einer Unterschrift auf weißem Papier. Der weiße Hintergrund wird
              automatisch entfernt.
            </p>
          )}
          <Button variant="outline" onClick={() => void upload()}>
            <ImageUp />
            {uploaded ? 'Anderes Bild wählen' : 'Bild wählen'}
          </Button>
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        <label
          className={cn(
            'text-muted-foreground flex items-center gap-2 text-sm',
            !storageAvailable && 'opacity-50',
          )}
        >
          <input
            type="checkbox"
            className="accent-primary"
            checked={remember && storageAvailable}
            disabled={!storageAvailable}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Für später speichern (nur in diesem Browser)
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>
            Abbrechen
          </Button>
          <Button onClick={() => void insert()} disabled={!canInsert}>
            Einfügen
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

function SavedSignatureImage({ signature }: { signature: StoredSignature }) {
  const src = useMemo(() => {
    const bytes = new Uint8Array(signature.data)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return `data:image/png;base64,${btoa(binary)}`
  }, [signature])
  return <img src={src} alt="" className="max-h-full max-w-full object-contain" />
}

/** Renders a typed name in a script font onto a transparent canvas. */
function renderTyped(text: string, font: string, color: string): HTMLCanvasElement | null {
  const size = 96
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!
  context.font = `${size}px ${font}`
  const width = Math.ceil(context.measureText(text).width) + size
  canvas.width = width
  canvas.height = Math.round(size * 1.8)
  context.font = `${size}px ${font}`
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.fillText(text, size / 2, canvas.height / 2)
  return trimCanvas(canvas)
}

// ---------------------------------------------------------------------------
// Drawing pad
// ---------------------------------------------------------------------------

interface SignaturePadHandle {
  clear: () => void
  /** Trimmed canvas of the drawing, or null if empty. */
  export: () => HTMLCanvasElement | null
}

function SignaturePad({
  ref,
  color,
  onInkChange,
}: {
  ref: Ref<SignaturePadHandle>
  color: string
  onInkChange: (hasInk: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Crisp lines on high-density screens
  useEffect(() => {
    const canvas = canvasRef.current!
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = canvas.clientWidth * ratio
    canvas.height = canvas.clientHeight * ratio
    const context = canvas.getContext('2d')!
    context.scale(ratio, ratio)
    context.lineCap = 'round'
    context.lineJoin = 'round'
  }, [])

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current!
      canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
      onInkChange(false)
    },
    export: () => trimCanvas(canvasRef.current!, 10),
  }))

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    last.current = point(event)
  }
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return
    const context = event.currentTarget.getContext('2d')!
    const next = point(event)
    // Pen pressure gives a natural stroke width where available
    const pressure = event.pressure > 0 && event.pointerType === 'pen' ? event.pressure : 0.5
    context.strokeStyle = color
    context.lineWidth = 1.5 + pressure * 2.5
    context.beginPath()
    context.moveTo(last.current.x, last.current.y)
    context.lineTo(next.x, next.y)
    context.stroke()
    last.current = next
    onInkChange(true)
  }
  const onPointerUp = () => {
    last.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label="Unterschriftenfeld"
      className="h-44 w-full cursor-crosshair touch-none rounded-md border bg-white"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}
