import {
  Check,
  Circle,
  Highlighter,
  ImagePlus,
  MessageSquareText,
  Minus,
  MousePointer2,
  MoveUpRight,
  PaintBucket,
  Pencil,
  Signature,
  Square,
  Stamp,
  StickyNote,
  Trash2,
  RotateCcw,
  Type,
  type LucideIcon,
  EyeOff,
  Bold,
  Italic,
  TextCursorInput,
} from 'lucide-react'
import type { TextFont } from '@/types/annotations'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { IconButton } from '@/components/layout/IconButton'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { isTwoPoint, removeAnnotation, replaceAnnotation } from '@/engine/document/annotations'
import { pickFiles } from '@/lib/file'
import { prepareImage } from '@/lib/images'
import { cn } from '@/lib/utils'
import {
  ANNOTATION_COLORS,
  useAnnotationStore,
  type AnnotationTool,
} from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { insertImage } from './insertImage'

const TOOLS: Array<{ tool: AnnotationTool; label: string; icon: LucideIcon; key: string }> = [
  { tool: 'select', label: 'Auswählen und verschieben', icon: MousePointer2, key: 'V' },
  { tool: 'rect', label: 'Rechteck', icon: Square, key: 'R' },
  { tool: 'ellipse', label: 'Ellipse', icon: Circle, key: 'E' },
  { tool: 'line', label: 'Linie', icon: Minus, key: 'L' },
  { tool: 'arrow', label: 'Pfeil', icon: MoveUpRight, key: 'P' },
  { tool: 'ink', label: 'Stift (freihand)', icon: Pencil, key: 'D' },
  { tool: 'marker', label: 'Marker (freihand)', icon: Highlighter, key: 'M' },
  { tool: 'text', label: 'Text', icon: Type, key: 'T' },
  {
    tool: 'edittext',
    label: 'Vorhandenen Text & Bilder bearbeiten',
    icon: TextCursorInput,
    key: 'B',
  },
  { tool: 'note', label: 'Notiz / Kommentar', icon: StickyNote, key: 'K' },
  { tool: 'redact', label: 'Schwärzen (dauerhaft)', icon: EyeOff, key: 'X' },
]

/** Picks an image file and places it on the current page. */
async function pickAndInsertImage() {
  const [file] = await pickFiles('image/*')
  if (!file) return
  try {
    insertImage(await prepareImage(file))
  } catch (error) {
    console.error('Bild konnte nicht eingefügt werden', error)
    toast.error(`„${file.name}“ konnte nicht als Bild gelesen werden.`)
  }
}
const STROKE_WIDTHS = [1, 2, 3, 5, 8]
const FONT_SIZES = [8, 10, 12, 14, 18, 24, 32, 48]
const TEXT_FONTS: Array<{ value: TextFont; name: string }> = [
  { value: 'sans', name: 'Helvetica' },
  { value: 'serif', name: 'Times' },
  { value: 'mono', name: 'Courier' },
]
const COLOR_NAMES: Record<string, string> = {
  '#e11d48': 'Rot',
  '#f59e0b': 'Gelb',
  '#16a34a': 'Grün',
  '#2563eb': 'Blau',
  '#7c3aed': 'Violett',
  '#0f172a': 'Schwarz',
  '#ffffff': 'Weiß',
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/** Tool bar of the annotation mode, shown above the document. */
export function AnnotationBar() {
  const tool = useAnnotationStore((state) => state.tool)
  const style = useAnnotationStore((state) => state.style)
  const selected = useAnnotationStore((state) => state.selected)
  const { setTool, setStyle, setActive } = useAnnotationStore.getState()

  const selectedAnnotation = useDocumentStore((state) => {
    if (!selected) return null
    const page = state.document?.pages.find((candidate) => candidate.id === selected.pageId)
    return page?.annotations?.find((candidate) => candidate.id === selected.id) ?? null
  })
  // Controls reflect the selected annotation, otherwise the style for new ones
  const kind = selectedAnnotation?.type ?? tool
  const showStroke = ['rect', 'ellipse', 'line', 'arrow', 'ink', 'marker'].includes(kind)
  const showFill = kind === 'rect' || kind === 'ellipse'
  const showFont = kind === 'text'
  const color = selectedAnnotation?.color ?? style.color
  const strokeWidth =
    selectedAnnotation && isTwoPoint(selectedAnnotation)
      ? selectedAnnotation.strokeWidth
      : selectedAnnotation?.type === 'ink'
        ? selectedAnnotation.marker
          ? selectedAnnotation.strokeWidth / 5
          : selectedAnnotation.strokeWidth
        : style.strokeWidth
  const filled =
    selectedAnnotation?.type === 'rect' || selectedAnnotation?.type === 'ellipse'
      ? selectedAnnotation.filled
      : style.filled
  const selectedText = selectedAnnotation?.type === 'text' ? selectedAnnotation : null
  const selectedImage = selectedAnnotation?.type === 'image' ? selectedAnnotation : null
  const fontSize = selectedText?.fontSize ?? style.fontSize
  const font = selectedText ? (selectedText.font ?? 'sans') : style.font
  const bold = selectedText ? !!selectedText.bold : style.bold
  const italic = selectedText ? !!selectedText.italic : style.italic
  // Sizes read from a PDF can be anything (e.g. 10.5 pt)
  const fontSizes = FONT_SIZES.includes(fontSize)
    ? FONT_SIZES
    : [...FONT_SIZES, fontSize].sort((a, b) => a - b)

  const deleteSelected = () => {
    const current = useAnnotationStore.getState().selected
    if (!current) return
    const { edit, document } = useDocumentStore.getState()
    const annotation = document?.pages
      .find((page) => page.id === current.pageId)
      ?.annotations?.find((item) => item.id === current.id)
    // An image of the PDF itself: "deleting" removes the original
    if (annotation?.type === 'image' && annotation.xobject) {
      edit((pages) => replaceAnnotation(pages, current.pageId, { ...annotation, removed: true }))
    } else {
      edit((pages) => removeAnnotation(pages, current.pageId, current.id))
    }
    useAnnotationStore.getState().select(null)
  }

  /** Drops the changes to a text line or image of the PDF: the original shows again. */
  const restoreOriginal = () => {
    const current = useAnnotationStore.getState().selected
    if (!current) return
    useDocumentStore.getState().edit((pages) => removeAnnotation(pages, current.pageId, current.id))
    useAnnotationStore.getState().select(null)
  }

  // Keyboard: tools, delete, escape
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const state = useAnnotationStore.getState()
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
        event.preventDefault()
        event.stopPropagation()
        deleteSelected()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (state.selected) state.select(null)
        else if (state.tool !== 'select') state.setTool('select')
        else state.setActive(false)
      } else {
        const match = TOOLS.find((entry) => entry.key === event.key.toUpperCase())
        if (match) {
          event.preventDefault()
          event.stopPropagation()
          state.setTool(match.tool)
        }
      }
    }
    // Capture phase: runs before the page shortcuts (N/P, Delete for pages …)
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  // Clicking anywhere else clears the selection
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (
        target?.closest(
          '[data-annotation], [data-annotation-layer], [data-annotation-bar], textarea, [role=dialog]',
        )
      )
        return
      if (useAnnotationStore.getState().selected) useAnnotationStore.getState().select(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <div
      className="bg-background flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1 pl-[max(0.5rem,env(safe-area-inset-left))]"
      role="toolbar"
      aria-label="Zeichnen und beschriften"
      data-annotation-bar
    >
      <div className="flex items-center">
        {TOOLS.map(({ tool: value, label, icon: Icon, key }) => (
          <IconButton
            key={value}
            label={label}
            shortcut={key}
            aria-pressed={tool === value}
            className={cn(tool === value && 'bg-accent text-accent-foreground')}
            onClick={() => setTool(value)}
          >
            <Icon />
          </IconButton>
        ))}
      </div>

      <IconButton label="Bild einfügen" onClick={() => void pickAndInsertImage()}>
        <ImagePlus />
      </IconButton>
      <IconButton
        label="Wasserzeichen"
        onClick={() => useUiStore.getState().setWatermarkOpen(true)}
      >
        <Stamp />
      </IconButton>
      <IconButton
        label="Signatur einfügen"
        onClick={() => useUiStore.getState().setSignatureOpen(true)}
      >
        <Signature />
      </IconButton>

      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />

      {kind !== 'redact' && (
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Farbe">
          {ANNOTATION_COLORS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={color === value}
              aria-label={COLOR_NAMES[value] ?? value}
              title={COLOR_NAMES[value] ?? value}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border border-black/20 transition-transform hover:scale-110',
                color === value && 'ring-ring ring-2 ring-offset-1',
              )}
              style={{ backgroundColor: value }}
              onClick={() => setStyle({ color: value })}
            >
              {color === value && (
                <Check
                  className="size-3.5"
                  style={{ color: value === '#ffffff' || value === '#f59e0b' ? '#000' : '#fff' }}
                  aria-hidden
                />
              )}
            </button>
          ))}
        </div>
      )}

      {showStroke && (
        <>
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
          <select
            aria-label="Linienstärke"
            className="border-input bg-background h-8 rounded-md border px-1.5 text-sm"
            value={strokeWidth}
            onChange={(event) => setStyle({ strokeWidth: Number(event.target.value) })}
          >
            {STROKE_WIDTHS.map((width) => (
              <option key={width} value={width}>
                {width} pt
              </option>
            ))}
          </select>
        </>
      )}
      {showFill && (
        <IconButton
          label={filled ? 'Füllung aus' : 'Füllung an'}
          aria-pressed={filled}
          className={cn(filled && 'bg-accent text-accent-foreground')}
          onClick={() => setStyle({ filled: !filled })}
        >
          <PaintBucket />
        </IconButton>
      )}
      {showFont && (
        <>
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
          <select
            aria-label="Schriftgröße"
            className="border-input bg-background h-8 rounded-md border px-1.5 text-sm"
            value={fontSize}
            onChange={(event) => setStyle({ fontSize: Number(event.target.value) })}
          >
            {fontSizes.map((size) => (
              <option key={size} value={size}>
                {size} pt
              </option>
            ))}
          </select>
          <select
            aria-label="Schriftart"
            className="border-input bg-background h-8 rounded-md border px-1.5 text-sm"
            value={font}
            onChange={(event) => setStyle({ font: event.target.value as TextFont })}
          >
            {TEXT_FONTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.name}
              </option>
            ))}
          </select>
          <IconButton
            label="Fett"
            aria-pressed={bold}
            className={cn(bold && 'bg-accent text-accent-foreground')}
            onClick={() => setStyle({ bold: !bold })}
          >
            <Bold />
          </IconButton>
          <IconButton
            label="Kursiv"
            aria-pressed={italic}
            className={cn(italic && 'bg-accent text-accent-foreground')}
            onClick={() => setStyle({ italic: !italic })}
          >
            <Italic />
          </IconButton>
        </>
      )}

      {selectedImage?.xobject && (
        <IconButton label="Original wiederherstellen" onClick={restoreOriginal}>
          <RotateCcw />
        </IconButton>
      )}
      {selectedAnnotation && (
        <IconButton
          label={
            selectedText?.replaces
              ? 'Änderung verwerfen (Originaltext)'
              : selectedImage?.xobject
                ? 'Bild entfernen'
                : 'Auswahl löschen'
          }
          shortcut="Entf"
          onClick={deleteSelected}
        >
          <Trash2 />
        </IconButton>
      )}

      {/* The toolbar hides its comments button on phones */}
      <IconButton
        label="Kommentare"
        className="sm:hidden"
        onClick={() => useUiStore.getState().setCommentsOpen(true)}
      >
        <MessageSquareText />
      </IconButton>

      <div className="flex-1" />
      <span className="text-muted-foreground px-2 text-xs whitespace-nowrap max-2xl:hidden">
        {tool === 'select'
          ? 'Element anklicken zum Bearbeiten, Doppelklick auf Text zum Ändern'
          : tool === 'text'
            ? 'Auf die Seite klicken und schreiben'
            : tool === 'edittext'
              ? 'Textzeile oder Bild anklicken – Text ändern, Bild verschieben oder entfernen'
              : tool === 'redact'
                ? 'Bereich aufziehen – Inhalt darunter wird beim Export entfernt'
                : tool === 'ink' || tool === 'marker'
                  ? 'Auf der Seite zeichnen – zwei Finger zoomen'
                  : tool === 'note'
                    ? 'Auf die Seite klicken, um eine Notiz zu setzen'
                    : 'Auf der Seite ziehen zum Zeichnen'}
      </span>
      <Button size="sm" onClick={() => setActive(false)}>
        Fertig
      </Button>
    </div>
  )
}
