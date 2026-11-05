import { MessageSquareText } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { toast } from 'sonner'
import {
  addAnnotation,
  hasCorners,
  REDACT_COLOR,
  imageDisplayAngle,
  isMarkup,
  isTwoPoint,
  MARKER_OPACITY,
  simplifyPoints,
  smoothPath,
  watermarkFontSize,
  MARKUP_OPACITY,
  markupPieces,
  moveAnnotation,
  removeAnnotation,
  replaceAnnotation,
  TEXT_ASCENT,
  TEXT_FONT_FAMILY,
  textFontCss,
  layoutText,
  layoutTextLines,
  placeRuns,
  type TextRun,
  textLineHeight,
  textDisplayAngle,
  toDisplay,
  toStored,
  unrotatedSize,
} from '@/engine/document/annotations'
import { arrowHead, NOTE_ICON_SIZE } from '@/engine/document/drawAnnotations'
import {
  imageReplacementFor,
  replacedLines,
  replacementFor,
  sameRect,
  type EditableImage,
  type EditableLine,
} from '@/engine/document/contentEditing'
import { cn } from '@/lib/utils'
import { NOTE_DEFAULT_COLOR, useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import type {
  Annotation,
  ImageAnnotation,
  InkAnnotation,
  WatermarkAnnotation,
  NoteAnnotation,
  PagePoint,
  PageRect,
  TextAnnotation,
} from '@/types/annotations'
import type { PageRef, ResolvedPage } from '@/types/document'
import { measureSourceFont, sourceFontCovers } from '@/engine/fonts/pdfFontInfo'
import { useEditableContent } from './useEditableContent'

type Handle = 'a' | 'b' | 'nw' | 'ne' | 'sw' | 'se'

type Drag =
  | { kind: 'create'; original: Annotation }
  | { kind: 'ink'; original: InkAnnotation; points: PagePoint[]; pointerId: number }
  | { kind: 'move'; start: PagePoint; original: Annotation }
  | { kind: 'resize'; handle: Handle; original: Annotation }

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const NO_ANNOTATIONS: Annotation[] = []
/** Note icon size on screen (it doesn't scale with the zoom, like in PDF viewers). */
const NOTE_ICON_PX = 24
/** Current time; called from event handlers only. */
const timestamp = () => Date.now()
/** Created shapes smaller than this (fraction of the page) count as accidental clicks. */
const MIN_SIZE = 0.005

let measureContext: CanvasRenderingContext2D | null = null

/** Width of a text line in CSS pixels, using the same font as rendering. */
function measureText(
  text: string,
  fontSizePx: number,
  weight = 'normal',
  family = TEXT_FONT_FAMILY,
  style = 'normal',
): number {
  measureContext ??= document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * fontSizePx * 0.55
  measureContext.font = `${style} ${weight} ${fontSizePx}px ${family}`
  return measureContext.measureText(text).width
}

/** Lines of a text annotation as drawn, with automatic wrapping for paragraphs. */
function annotationTextLines(
  annotation: TextAnnotation,
  storedSize: { width: number; height: number },
  text = annotation.text,
): string[] {
  const frameWidth = ((annotation.turns % 4) + 4) % 2 === 0 ? storedSize.width : storedSize.height
  return layoutTextLines(
    { text, wrapWidth: annotation.wrapWidth },
    textMeasure(annotation, text),
    frameWidth,
  )
}

/** The lines of a text annotation split into runs as the export draws them (alignment). */
function annotationRuns(
  annotation: TextAnnotation,
  storedSize: { width: number; height: number },
): TextRun[][] {
  const frameWidth = ((annotation.turns % 4) + 4) % 2 === 0 ? storedSize.width : storedSize.height
  const measure = textMeasure(annotation)
  const max = annotation.wrapWidth ? annotation.wrapWidth * frameWidth : undefined
  return layoutText(annotation, measure, frameWidth).map((line) =>
    placeRuns(line, annotation.align, max, measure),
  )
}

/**
 * Width of a line in points at the annotation's size: with the original
 * font's widths when it will be used on export, else as rendered here.
 */
function textMeasure(annotation: TextAnnotation, text = annotation.text) {
  const source = annotation.sourceFont
  if (source && sourceFontCovers(source, text)) {
    return (line: string) => measureSourceFont(source, line, annotation.fontSize) ?? 0
  }
  const font = textFontCss(annotation)
  return (line: string) =>
    measureText(line, annotation.fontSize, font.weight, font.family, font.style)
}

interface AnnotationLayerProps {
  page: ResolvedPage
  scale: number
  /** Editable (main view) or display only (thumbnails, previews). */
  interactive: boolean
}

/**
 * Shapes, lines and texts on top of a page. In annotation mode they can be
 * drawn, selected, moved, resized and (texts) edited; every finished change is
 * one undoable edit of the document.
 */
export function AnnotationLayer({ page, scale, interactive }: AnnotationLayerProps) {
  const pageId = page.ref.id
  const annotations = page.ref.annotations ?? NO_ANNOTATIONS
  const modeActive = useAnnotationStore((state) => state.active)
  const tool = useAnnotationStore((state) => state.tool)
  const selected = useAnnotationStore((state) => state.selected)
  const editing = useAnnotationStore((state) => state.editing)
  const content = useEditableContent(page, interactive && modeActive && tool === 'edittext')

  const active = interactive && modeActive
  const drawing = active && tool !== 'select'
  const width = page.fullSize.width * scale
  const height = page.fullSize.height * scale
  const turns = page.turns
  const storedSize = unrotatedSize(page.fullSize, turns)

  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)

  /** Pointer position as fraction of the displayed page. */
  const pointFrom = (event: PointerEvent): PagePoint => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
  }
  const px = (point: PagePoint) => {
    const display = toDisplay(point, turns)
    return { x: display.x * width, y: display.y * height }
  }

  const commit = (change: (pages: PageRef[]) => PageRef[]) =>
    useDocumentStore.getState().edit(change)

  // --- Creating ---------------------------------------------------------------

  const onSurfacePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!drawing || event.button !== 0) return
    event.preventDefault()
    // Existing text is edited through the line targets
    if (tool === 'edittext') return
    const at = toStored(pointFrom(event), turns)
    const id = crypto.randomUUID()
    const { color, strokeWidth, filled, fontSize, font, bold, italic } =
      useAnnotationStore.getState().style

    if (tool === 'note') {
      // Center the icon on the click
      const point = pointFrom(event)
      const offset = NOTE_ICON_PX / 2
      const note: NoteAnnotation = {
        id,
        type: 'note',
        color: NOTE_DEFAULT_COLOR,
        at: toStored({ x: point.x - offset / width, y: point.y - offset / height }, turns),
        text: '',
        createdAt: timestamp(),
        updatedAt: timestamp(),
      }
      commit((pages) => addAnnotation(pages, pageId, note))
      const store = useAnnotationStore.getState()
      store.setTool('select')
      store.setOpenNote({ pageId, id, isNew: true })
      return
    }

    if (tool === 'text') {
      const text: TextAnnotation = {
        id,
        type: 'text',
        color,
        at,
        text: '',
        fontSize,
        turns,
        font,
        bold,
        italic,
      }
      setDraft(text)
      useAnnotationStore.getState().setTool('select')
      useAnnotationStore.getState().setEditing({ pageId, id })
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)

    if (tool === 'ink' || tool === 'marker') {
      const marker = tool === 'marker'
      const ink: InkAnnotation = {
        id,
        type: 'ink',
        color,
        strokeWidth: marker ? Math.max(8, strokeWidth * 5) : strokeWidth,
        marker,
        points: [at],
      }
      drag.current = { kind: 'ink', original: ink, points: [at], pointerId: event.pointerId }
      setDraft(ink)
      return
    }

    const original: Annotation =
      tool === 'redact'
        ? { id, type: 'redact', color: REDACT_COLOR, a: at, b: at }
        : tool === 'rect' || tool === 'ellipse'
          ? { id, type: tool, color, a: at, b: at, strokeWidth, filled }
          : {
              id,
              type: tool as 'line' | 'arrow',
              color,
              a: at,
              b: at,
              strokeWidth,
            }
    drag.current = { kind: 'create', original }
    setDraft(original)
  }

  // --- Moving & resizing -----------------------------------------------------

  const startMove = (annotation: Annotation) => (event: PointerEvent<Element>) => {
    if (!active || tool !== 'select' || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    useAnnotationStore.getState().select({ pageId, id: annotation.id })
    // Text markup is tied to the text below it: select only, don't move
    if (isMarkup(annotation)) return
    drag.current = { kind: 'move', start: pointFrom(event), original: annotation }
  }

  const startResize =
    (annotation: Annotation, handle: Handle) => (event: PointerEvent<SVGElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { kind: 'resize', handle, original: annotation }
    }

  const onPointerMove = (event: PointerEvent) => {
    const current = drag.current
    if (!current) return
    const point = pointFrom(event)
    if (current.kind === 'ink') {
      if (event.pointerId !== current.pointerId) return
      const next = toStored(point, turns)
      const previous = toDisplay(current.points[current.points.length - 1], turns)
      // Skip tiny moves: fewer points, same look
      if (Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height) < 1.5) return
      current.points.push(next)
      setDraft({ ...current.original, points: [...current.points] })
    } else if (
      current.kind === 'create' &&
      (isTwoPoint(current.original) || current.original.type === 'redact')
    ) {
      setDraft({ ...current.original, b: toStored(point, turns) })
    } else if (current.kind === 'move') {
      // Small jitter isn't a move (lets a tap on a note open it)
      const distance = Math.hypot(point.x - current.start.x, point.y - current.start.y)
      if (distance < 0.004 && !draft) return
      setDraft(
        moveAnnotation(
          current.original,
          point.x - current.start.x,
          point.y - current.start.y,
          turns,
        ),
      )
    } else if (current.kind === 'resize') {
      setDraft(resize(current.original, current.handle, point, turns, width / height))
    }
  }

  const onPointerUp = () => {
    const current = drag.current
    drag.current = null
    if (!current) return
    const result = draft
    setDraft(null)
    if (current.kind === 'move' && current.original.type === 'note' && !result) {
      useAnnotationStore.getState().setOpenNote({ pageId, id: current.original.id })
      return
    }
    if (!result || result === current.original) return

    if (current.kind === 'ink') {
      // Simplify with a tolerance of about half a pixel at the current zoom
      const tolerance = 0.5 / Math.max(width, height)
      const points = simplifyPoints(current.points, tolerance)
      const stroke: InkAnnotation = {
        ...current.original,
        points: points.length > 1 ? points : [points[0], points[0]],
      }
      // Keep the pen: draw the next stroke right away
      commit((pages) => addAnnotation(pages, pageId, stroke))
      return
    }

    if (current.kind === 'create') {
      if (result.type === 'text' || isTiny(result, turns)) return
      commit((pages) => addAnnotation(pages, pageId, result))
      const store = useAnnotationStore.getState()
      store.setTool('select')
      store.select({ pageId, id: result.id })
    } else {
      commit((pages) => replaceAnnotation(pages, pageId, result))
    }
  }

  // --- Text editing -------------------------------------------------------------

  const editingHere = editing?.pageId === pageId ? editing.id : null
  // A draft only exists while the mode is on (leaving it discards unfinished work)
  const current = active ? draft : null
  const shown = annotations.map((item) => (current?.id === item.id ? current : item))
  if (current && !annotations.some((item) => item.id === current.id)) shown.push(current)
  const editingText = shown.find(
    (item): item is TextAnnotation => item.id === editingHere && item.type === 'text',
  )

  const finishText = (value: string) => {
    if (!editingText) return
    const exists = annotations.some((item) => item.id === editingText.id)
    const text = value.replace(/\s+$/, '')
    // Replaced PDF text stays replaced even when emptied (that deletes the line)
    const replacing = !!editingText.replaces
    const unchanged = text === editingText.text
    let kept = true
    if (!exists && replacing && unchanged) {
      // Opened an existing line without changing it: keep the original
      kept = false
    } else if (!text && !replacing) {
      if (exists) commit((pages) => removeAnnotation(pages, pageId, editingText.id))
      kept = false
    } else if (exists) {
      if (!unchanged) {
        commit((pages) => replaceAnnotation(pages, pageId, { ...editingText, text }))
      }
    } else {
      commit((pages) => addAnnotation(pages, pageId, { ...editingText, text }))
    }
    setDraft(null)
    useAnnotationStore.getState().setEditing(null)
    if (kept) useAnnotationStore.getState().select({ pageId, id: editingText.id })
  }

  /** Starts editing a line of the PDF itself (or the text that already replaces it). */
  const editLine = (line: EditableLine) => (event: PointerEvent<SVGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const store = useAnnotationStore.getState()
    const existing = annotations.find(
      (item): item is TextAnnotation =>
        item.type === 'text' && !!item.replaces && sameRect(item.replaces, line.rect),
    )
    if (existing) {
      store.setEditing({ pageId, id: existing.id })
      return
    }
    const replacement = replacementFor(line, crypto.randomUUID())
    const cover = sampleBackground(
      svgRef.current,
      { a: px(line.rect.a), b: px(line.rect.b) },
      {
        width,
        height,
      },
    )
    if (cover && cover !== '#ffffff') replacement.cover = cover
    // Scanned text has no color of its own: take the darkest ink of the line
    if (line.invisible) {
      replacement.color =
        sampleInk(svgRef.current, { a: px(line.rect.a), b: px(line.rect.b) }, { width, height }) ??
        '#000000'
    }
    setDraft(replacement)
    store.setEditing({ pageId, id: replacement.id })
  }
  /** Turns an image of the PDF into an editable copy (or selects the existing one). */
  const editImage = (image: EditableImage) => (event: PointerEvent<SVGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const store = useAnnotationStore.getState()
    const existing = annotations.find(
      (item): item is ImageAnnotation => item.type === 'image' && item.xobject === image.xobject,
    )
    if (existing) {
      // A removed image comes back on click
      if (existing.removed) {
        const restored = { ...existing }
        delete restored.removed
        commit((pages) => replaceAnnotation(pages, pageId, restored))
      }
      store.setTool('select')
      store.select({ pageId, id: existing.id })
      return
    }
    const source = useDocumentStore.getState().sources.get(page.ref.sourceId)
    if (!source) return
    const cover = sampleBackground(
      svgRef.current,
      { a: px(image.rect.a), b: px(image.rect.b) },
      { width, height },
    )
    void import('@/engine/mupdf/client')
      .then(({ readImage }) => readImage(source.id, page.ref.sourceIndex, image.index))
      .then((pixels) => {
        const asset = useDocumentStore.getState().addAsset({ id: crypto.randomUUID(), ...pixels })
        const replacement = imageReplacementFor(image, asset.id, crypto.randomUUID())
        if (cover && cover !== '#ffffff') replacement.cover = cover
        commit((pages) => addAnnotation(pages, pageId, replacement))
        const current = useAnnotationStore.getState()
        current.setTool('select')
        current.select({ pageId, id: replacement.id })
      })
      .catch((error: unknown) => {
        console.error('Bild konnte nicht gelesen werden', error)
        toast.error('Dieses Bild kann nicht bearbeitet werden.')
      })
  }

  const ready =
    active && tool === 'edittext' && content?.status === 'ready' ? content.content : null
  const editableLines = ready?.paragraphs ?? []
  const editableImages = ready?.images ?? []
  // Text editing only needs the line targets; elsewhere the page keeps scrolling
  const capturing = drawing && tool !== 'edittext'

  if (shown.length === 0 && !drawing) return null

  const selectedHere = active && selected?.pageId === pageId ? selected.id : null

  return (
    <>
      <svg
        ref={svgRef}
        className="absolute inset-0 overflow-visible"
        width={width}
        height={height}
        style={{
          pointerEvents: capturing ? 'all' : 'none',
          cursor: capturing ? (tool === 'text' ? 'text' : 'crosshair') : undefined,
          touchAction: capturing ? 'none' : undefined,
        }}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={(event) => {
          // A second finger means pinch-to-zoom, not drawing: drop the started stroke
          if (event.touches.length > 1 && drag.current?.kind === 'ink') {
            drag.current = null
            setDraft(null)
          }
        }}
        data-annotation-layer
        aria-hidden={!active}
      >
        {/* Replaced PDF text and images are hidden below their new version (removed on export) */}
        {shown.map((annotation) =>
          annotation.type === 'text' && annotation.replaces ? (
            replacedLines(annotation).map((rect, index) => (
              <ReplacedContentCover
                key={`cover-${annotation.id}-${index}`}
                rect={rect}
                color={annotation.cover}
                px={px}
              />
            ))
          ) : annotation.type === 'image' && annotation.replaces ? (
            <ReplacedContentCover
              key={`cover-${annotation.id}`}
              rect={annotation.replaces}
              color={annotation.cover}
              px={px}
            />
          ) : null,
        )}
        {editableImages.map((image) => {
          const a = px(image.rect.a)
          const b = px(image.rect.b)
          return (
            <rect
              key={`image-${image.index}`}
              x={Math.min(a.x, b.x)}
              y={Math.min(a.y, b.y)}
              width={Math.abs(a.x - b.x)}
              height={Math.abs(a.y - b.y)}
              className="fill-transparent stroke-violet-500/50 hover:fill-violet-500/10 hover:stroke-violet-500"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              style={{ pointerEvents: 'all', cursor: 'pointer' }}
              onPointerDown={editImage(image)}
              data-annotation
            >
              <title>Bild bearbeiten: verschieben, Größe ändern oder entfernen</title>
            </rect>
          )
        })}
        {editableLines.map((line, index) => {
          const a = px(line.rect.a)
          const b = px(line.rect.b)
          return (
            <rect
              key={index}
              x={Math.min(a.x, b.x) - 2}
              y={Math.min(a.y, b.y) - 2}
              width={Math.abs(a.x - b.x) + 4}
              height={Math.abs(a.y - b.y) + 4}
              className="fill-transparent stroke-sky-500/40 hover:fill-sky-500/10 hover:stroke-sky-500"
              strokeDasharray="3 2"
              style={{ pointerEvents: 'all', cursor: 'text' }}
              onPointerDown={editLine(line)}
              data-annotation
            >
              <title>{`Bearbeiten: ${line.text}`}</title>
            </rect>
          )
        })}
        {shown.map((annotation) => {
          if (annotation.id === editingHere || annotation.type === 'note') return null
          // A removed original image leaves only its cover
          if (annotation.type === 'image' && annotation.removed) return null
          // Watermarks are managed in their dialog, not on the page
          if (annotation.type === 'watermark') {
            return (
              <AnnotationShape
                key={annotation.id}
                annotation={annotation}
                px={px}
                scale={scale}
                turns={turns}
                storedSize={storedSize}
              />
            )
          }
          const box = boundingBox(annotation, px, scale, turns, storedSize)
          return (
            <g key={annotation.id} data-annotation>
              <AnnotationShape
                annotation={annotation}
                px={px}
                scale={scale}
                turns={turns}
                storedSize={storedSize}
              />
              {active && tool === 'select' && (
                <rect
                  {...pad(box, 6)}
                  fill="transparent"
                  style={{ pointerEvents: 'all', cursor: 'move', touchAction: 'none' }}
                  onPointerDown={startMove(annotation)}
                  onDoubleClick={() =>
                    annotation.type === 'text' &&
                    useAnnotationStore.getState().setEditing({ pageId, id: annotation.id })
                  }
                />
              )}
              {annotation.id === selectedHere && (
                <SelectionFrame
                  annotation={annotation}
                  box={box}
                  px={px}
                  onHandle={(handle) => startResize(annotation, handle)}
                />
              )}
            </g>
          )
        })}
      </svg>
      {shown.map((annotation) =>
        annotation.type === 'note' ? (
          <NoteIcon
            key={annotation.id}
            note={annotation}
            position={px(annotation.at)}
            size={interactive ? NOTE_ICON_PX : Math.max(3, NOTE_ICON_SIZE * scale)}
            interactive={interactive}
            selected={annotation.id === selectedHere}
            noteKey={`${pageId}:${annotation.id}`}
            // In annotation mode notes can be dragged; a tap still opens them
            onPointerDown={active && tool === 'select' ? startMove(annotation) : undefined}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onOpen={
              active
                ? undefined
                : () => useAnnotationStore.getState().setOpenNote({ pageId, id: annotation.id })
            }
          />
        ) : null,
      )}
      {editingText && (
        <TextEditor
          key={editingText.id}
          annotation={editingText}
          anchor={px(editingText.at)}
          angle={textDisplayAngle(editingText, turns)}
          scale={scale}
          storedSize={storedSize}
          onDone={finishText}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function NoteIcon({
  note,
  position,
  size,
  interactive,
  selected,
  noteKey,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onOpen,
}: {
  note: NoteAnnotation
  position: { x: number; y: number }
  size: number
  interactive: boolean
  selected: boolean
  noteKey: string
  onPointerDown?: (event: PointerEvent<Element>) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: () => void
  onOpen?: () => void
}) {
  const preview = note.text.trim() || 'Leere Notiz'
  if (!interactive) {
    return (
      <span
        className="absolute rounded-[2px] shadow-sm"
        style={{
          left: position.x,
          top: position.y,
          width: size,
          height: size,
          backgroundColor: note.color,
        }}
      />
    )
  }
  return (
    <button
      type="button"
      data-annotation
      data-note-id={noteKey}
      title={preview}
      aria-label={`Notiz: ${preview}`}
      className={cn(
        'absolute flex items-center justify-center rounded-md border border-black/25 text-black/70 shadow-md transition-transform hover:scale-110',
        selected && 'ring-primary ring-2 ring-offset-1',
      )}
      style={{
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        backgroundColor: note.color,
        touchAction: onPointerDown ? 'none' : undefined,
        cursor: onPointerDown ? 'move' : 'pointer',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onOpen}
    >
      <MessageSquareText className="size-3.5" aria-hidden />
    </button>
  )
}

function isTiny(annotation: Annotation, turns: number): boolean {
  if (!hasCorners(annotation)) return false
  const a = toDisplay(annotation.a, turns)
  const b = toDisplay(annotation.b, turns)
  return Math.abs(a.x - b.x) < MIN_SIZE && Math.abs(a.y - b.y) < MIN_SIZE
}

function resize(
  annotation: Annotation,
  handle: Handle,
  point: PagePoint,
  turns: number,
  /** Displayed page width / height, to keep image proportions in pixels. */
  aspect: number,
): Annotation {
  if (!hasCorners(annotation)) return annotation
  if (annotation.type === 'image') return resizeImage(annotation, handle, point, turns, aspect)
  if (annotation.type === 'line' || annotation.type === 'arrow') {
    const moved = toStored(point, turns)
    return handle === 'a' ? { ...annotation, a: moved } : { ...annotation, b: moved }
  }
  const a = toDisplay(annotation.a, turns)
  const b = toDisplay(annotation.b, turns)
  let x0 = Math.min(a.x, b.x)
  let y0 = Math.min(a.y, b.y)
  let x1 = Math.max(a.x, b.x)
  let y1 = Math.max(a.y, b.y)
  if (handle.includes('w')) x0 = point.x
  if (handle.includes('e')) x1 = point.x
  if (handle.includes('n')) y0 = point.y
  if (handle.includes('s')) y1 = point.y
  return {
    ...annotation,
    a: toStored({ x: x0, y: y0 }, turns),
    b: toStored({ x: x1, y: y1 }, turns),
  }
}

/** Resizes an image from a corner while keeping its proportions. */
function resizeImage(
  image: ImageAnnotation,
  handle: Handle,
  point: PagePoint,
  turns: number,
  aspect: number,
): ImageAnnotation {
  const a = toDisplay(image.a, turns)
  const b = toDisplay(image.b, turns)
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  // The corner opposite the handle stays fixed
  const fixed = {
    x: handle.includes('w') ? x1 : x0,
    y: handle.includes('n') ? y1 : y0,
  }
  const ratio = ((x1 - x0) * aspect) / Math.max(1e-6, y1 - y0) // width / height in pixels
  const width = Math.max(0.02, Math.abs(point.x - fixed.x))
  const height = (width * aspect) / ratio
  const corner = {
    x: handle.includes('w') ? fixed.x - width : fixed.x + width,
    y: handle.includes('n') ? fixed.y - height : fixed.y + height,
  }
  return {
    ...image,
    a: toStored({ x: Math.min(fixed.x, corner.x), y: Math.min(fixed.y, corner.y) }, turns),
    b: toStored({ x: Math.max(fixed.x, corner.x), y: Math.max(fixed.y, corner.y) }, turns),
  }
}

function boundingBox(
  annotation: Annotation,
  px: (point: PagePoint) => { x: number; y: number },
  scale: number,
  turns: number,
  storedSize: { width: number; height: number },
): Box {
  if (annotation.type === 'text') {
    const anchor = px(annotation.at)
    const fontSize = annotation.fontSize * scale
    const lines = annotationTextLines(annotation, storedSize)
    const font = textFontCss(annotation)
    const frameWidth = ((annotation.turns % 4) + 4) % 2 === 0 ? storedSize.width : storedSize.height
    // Paragraphs span their wrap width (alignment places lines within it)
    const w = annotation.wrapWidth
      ? annotation.wrapWidth * frameWidth * scale
      : Math.max(
          fontSize * 0.5,
          ...lines.map((line) => measureText(line, fontSize, font.weight, font.family, font.style)),
        )
    const h = lines.length * fontSize * textLineHeight(annotation)
    const angle = (textDisplayAngle(annotation, turns) * Math.PI) / 180
    const corners = [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ].map(([x, y]) => ({
      x: anchor.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: anchor.y + x * Math.sin(angle) + y * Math.cos(angle),
    }))
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }
  if (annotation.type === 'ink') {
    const points = annotation.points.map(px)
    const pad = (annotation.strokeWidth * scale) / 2
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + 2 * pad,
      height: Math.max(...ys) - Math.min(...ys) + 2 * pad,
    }
  }
  if (annotation.type === 'watermark') return { x: 0, y: 0, width: 0, height: 0 }
  if (annotation.type === 'note') {
    const at = px(annotation.at)
    return { x: at.x, y: at.y, width: NOTE_ICON_PX, height: NOTE_ICON_PX }
  }
  if (isMarkup(annotation)) {
    const corners = annotation.rects.flatMap((rect) => [px(rect.a), px(rect.b)])
    const xs = corners.map((c) => c.x)
    const ys = corners.map((c) => c.y)
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }
  const a = px(annotation.a)
  const b = px(annotation.b)
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

function pad(box: Box, amount: number) {
  return {
    x: box.x - amount,
    y: box.y - amount,
    width: box.width + 2 * amount,
    height: box.height + 2 * amount,
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

interface ShapeProps {
  annotation: Annotation
  px: (point: PagePoint) => { x: number; y: number }
  scale: number
  turns: number
  /** Unrotated page size in points (for markup line thickness). */
  storedSize: { width: number; height: number }
}

export function AnnotationShape({ annotation, px, scale, turns, storedSize }: ShapeProps) {
  const { color } = annotation
  const assetUrl = useDocumentStore((state) =>
    annotation.type === 'image' || (annotation.type === 'watermark' && annotation.assetId)
      ? state.assets.get(annotation.assetId!)?.url
      : undefined,
  )

  if (annotation.type === 'image') {
    const a = px(annotation.a)
    const b = px(annotation.b)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(a.x - b.x)
    const h = Math.abs(a.y - b.y)
    const angle = imageDisplayAngle(annotation, turns)
    // Turned a quarter: the picture's own width runs along the box height
    const quarter = angle % 180 !== 0
    const iw = quarter ? h : w
    const ih = quarter ? w : h
    if (!assetUrl) return <rect x={x} y={y} width={w} height={h} fill="#e5e7eb" />
    return (
      <image
        href={assetUrl}
        x={x + (w - iw) / 2}
        y={y + (h - ih) / 2}
        width={iw}
        height={ih}
        preserveAspectRatio="none"
        transform={`rotate(${angle} ${x + w / 2} ${y + h / 2})`}
      />
    )
  }

  if (annotation.type === 'text') {
    const anchor = px(annotation.at)
    const fontSize = annotation.fontSize * scale
    const font = textFontCss(annotation)
    return (
      <g transform={`rotate(${textDisplayAngle(annotation, turns)} ${anchor.x} ${anchor.y})`}>
        {annotationRuns(annotation, storedSize).flatMap((runs, index) =>
          runs.map((run, part) => (
            <text
              key={`${index}-${part}`}
              x={anchor.x + run.x * scale}
              y={anchor.y + fontSize * (TEXT_ASCENT + index * textLineHeight(annotation))}
              // With the original font, each run gets the width it has in the export
              {...(annotation.sourceFont &&
                sourceFontCovers(annotation.sourceFont, annotation.text) &&
                run.text.trim() && {
                  textLength:
                    (measureSourceFont(annotation.sourceFont, run.text, annotation.fontSize) ?? 0) *
                    scale,
                  lengthAdjust: 'spacing',
                })}
              fill={color}
              fontSize={fontSize}
              fontFamily={font.family}
              fontWeight={font.weight}
              fontStyle={font.style}
              style={{ whiteSpace: 'pre' }}
            >
              {run.text}
            </text>
          )),
        )}
      </g>
    )
  }

  if (annotation.type === 'note') return null

  if (annotation.type === 'ink') {
    return (
      <path
        d={smoothPath(annotation.points.map(px))}
        fill="none"
        stroke={color}
        strokeWidth={Math.max(0.75, annotation.strokeWidth * scale)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={annotation.marker ? MARKER_OPACITY : 1}
        style={annotation.marker ? { mixBlendMode: 'multiply' } : undefined}
      />
    )
  }

  if (annotation.type === 'watermark') {
    return (
      <WatermarkShape
        watermark={annotation}
        px={px}
        scale={scale}
        turns={turns}
        storedSize={storedSize}
        url={assetUrl}
      />
    )
  }

  if (isMarkup(annotation)) {
    return (
      <g>
        {markupPieces(annotation, storedSize).map((piece, index) => {
          const a = px(piece.a)
          const b = px(piece.b)
          if (piece.kind === 'rect') {
            return (
              <rect
                key={index}
                x={Math.min(a.x, b.x)}
                y={Math.min(a.y, b.y)}
                width={Math.abs(a.x - b.x)}
                height={Math.abs(a.y - b.y)}
                fill={color}
                fillOpacity={MARKUP_OPACITY}
                style={{ mixBlendMode: 'multiply' }}
              />
            )
          }
          return (
            <line
              key={index}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={color}
              strokeWidth={Math.max(1, piece.thickness * scale)}
            />
          )
        })}
      </g>
    )
  }

  const a = px(annotation.a)
  const b = px(annotation.b)

  if (annotation.type === 'redact') {
    // Shows the result; the dashed red edge marks it as a redaction that is
    // applied (content removed) on export
    return (
      <rect
        x={Math.min(a.x, b.x)}
        y={Math.min(a.y, b.y)}
        width={Math.abs(a.x - b.x)}
        height={Math.abs(a.y - b.y)}
        fill={REDACT_COLOR}
        stroke="#ef4444"
        strokeWidth={1}
        strokeDasharray="4 3"
      >
        <title>Schwärzung – wird beim Export dauerhaft angewendet</title>
      </rect>
    )
  }

  const strokeWidth = Math.max(0.5, annotation.strokeWidth * scale)

  if (annotation.type === 'rect' || annotation.type === 'ellipse') {
    const fill = annotation.filled ? color : 'none'
    const common = { stroke: color, strokeWidth, fill, fillOpacity: 0.25 }
    if (annotation.type === 'rect') {
      return (
        <rect
          x={Math.min(a.x, b.x)}
          y={Math.min(a.y, b.y)}
          width={Math.abs(a.x - b.x)}
          height={Math.abs(a.y - b.y)}
          {...common}
        />
      )
    }
    return (
      <ellipse
        cx={(a.x + b.x) / 2}
        cy={(a.y + b.y) / 2}
        rx={Math.abs(a.x - b.x) / 2}
        ry={Math.abs(a.y - b.y) / 2}
        {...common}
      />
    )
  }

  const line = { stroke: color, strokeWidth, strokeLinecap: 'round' as const }
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...line} />
      {annotation.type === 'arrow' &&
        arrowHead(a, b, annotation.strokeWidth * scale).map(([x, y], index) => (
          <line key={index} x1={b.x} y1={b.y} x2={x} y2={y} {...line} />
        ))}
    </g>
  )
}

/** Watermark centered on the page (same layout as in the PDF export). */
function WatermarkShape({
  watermark,
  px,
  scale,
  turns,
  storedSize,
  url,
}: {
  watermark: WatermarkAnnotation
  px: (point: PagePoint) => { x: number; y: number }
  scale: number
  turns: number
  storedSize: { width: number; height: number }
  url?: string
}) {
  const center = px({ x: 0.5, y: 0.5 })
  const frameWidth = ((watermark.turns % 4) + 4) % 2 === 0 ? storedSize.width : storedSize.height
  // Page turned since adding (clockwise) minus the watermark's own counter-clockwise angle
  const rotation = ((((turns - watermark.turns) % 4) + 4) % 4) * 90 - watermark.angle
  const transform = `rotate(${rotation} ${center.x} ${center.y})`
  const asset = useDocumentStore((state) =>
    watermark.assetId ? state.assets.get(watermark.assetId) : undefined,
  )

  if (watermark.assetId) {
    if (!url || !asset) return null
    const width = watermark.size * frameWidth * scale
    const height = (width * asset.height) / Math.max(1, asset.width)
    return (
      <image
        href={url}
        x={center.x - width / 2}
        y={center.y - height / 2}
        width={width}
        height={height}
        opacity={watermark.opacity}
        transform={transform}
        preserveAspectRatio="none"
      />
    )
  }
  const fontSize =
    watermarkFontSize(watermark, frameWidth, measureText(watermark.text, 100, 'bold') / 100) * scale
  return (
    <text
      x={center.x}
      y={center.y}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily={TEXT_FONT_FAMILY}
      fontWeight="bold"
      fontSize={fontSize}
      fill={watermark.color}
      fillOpacity={watermark.opacity}
      transform={transform}
      style={{ whiteSpace: 'pre' }}
    >
      {watermark.text}
    </text>
  )
}

function SelectionFrame({
  annotation,
  box,
  px,
  onHandle,
}: {
  annotation: Annotation
  box: Box
  px: (point: PagePoint) => { x: number; y: number }
  onHandle: (handle: Handle) => (event: PointerEvent<SVGElement>) => void
}) {
  let handles: Array<{ handle: Handle; x: number; y: number }> = []
  if (annotation.type === 'line' || annotation.type === 'arrow') {
    handles = [
      { handle: 'a', ...px(annotation.a) },
      { handle: 'b', ...px(annotation.b) },
    ]
  } else if (hasCorners(annotation)) {
    handles = [
      { handle: 'nw', x: box.x, y: box.y },
      { handle: 'ne', x: box.x + box.width, y: box.y },
      { handle: 'sw', x: box.x, y: box.y + box.height },
      { handle: 'se', x: box.x + box.width, y: box.y + box.height },
    ]
  }
  return (
    <g>
      <rect
        {...pad(box, 4)}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={1}
        strokeDasharray="4 3"
        style={{ pointerEvents: 'none' }}
      />
      {handles.map(({ handle, x, y }) => (
        <g
          key={handle}
          style={{ pointerEvents: 'all', touchAction: 'none' }}
          onPointerDown={onHandle(handle)}
        >
          {/* Larger invisible target for fingers */}
          <circle cx={x} cy={y} r={14} fill="transparent" style={{ cursor: 'grab' }} />
          <rect
            x={x - 5}
            y={y - 5}
            width={10}
            height={10}
            rx={2}
            fill="var(--color-background)"
            stroke="var(--color-primary)"
            strokeWidth={2}
            style={{ cursor: 'grab' }}
          />
        </g>
      ))}
    </g>
  )
}

/**
 * Hides replaced PDF text or images on screen with the page color next to
 * them. On export the originals are removed instead, so the real background stays.
 */
function ReplacedContentCover({
  rect,
  color = '#ffffff',
  px,
}: {
  rect: PageRect
  color?: string
  px: (point: PagePoint) => { x: number; y: number }
}) {
  const a = px(rect.a)
  const b = px(rect.b)
  return (
    <rect
      x={Math.min(a.x, b.x) - 2}
      y={Math.min(a.y, b.y) - 2}
      width={Math.abs(a.x - b.x) + 4}
      height={Math.abs(a.y - b.y) + 4}
      fill={color}
    />
  )
}

/**
 * Color of the rendered page just left of a text line (right of it, if the
 * line starts at the edge), or undefined if the page isn't rendered yet.
 */
function sampleBackground(
  svg: SVGSVGElement | null,
  line: { a: { x: number; y: number }; b: { x: number; y: number } },
  size: { width: number; height: number },
): string | undefined {
  const canvas = svg?.parentElement?.querySelector('canvas')
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return undefined
  const ratio = canvas.width / size.width
  const y = Math.round(((line.a.y + line.b.y) / 2) * ratio)
  const left = Math.min(line.a.x, line.b.x) - 4
  const right = Math.max(line.a.x, line.b.x) + 4
  const x = Math.round((left >= 0 ? left : right) * ratio)
  if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return undefined
  try {
    const [r, g, b, alpha] = context.getImageData(x, y, 1, 1).data
    if (alpha < 250) return undefined
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return undefined
  }
}

/** Darkest color of the rendered page within an area (the ink of scanned text). */
function sampleInk(
  svg: SVGSVGElement | null,
  area: { a: { x: number; y: number }; b: { x: number; y: number } },
  size: { width: number; height: number },
): string | undefined {
  const canvas = svg?.parentElement?.querySelector('canvas')
  const context = canvas?.getContext('2d')
  if (!canvas || !context) return undefined
  const ratio = canvas.width / size.width
  const x = Math.max(0, Math.floor(Math.min(area.a.x, area.b.x) * ratio))
  const y = Math.max(0, Math.floor(Math.min(area.a.y, area.b.y) * ratio))
  const w = Math.min(canvas.width - x, Math.ceil(Math.abs(area.a.x - area.b.x) * ratio))
  const h = Math.min(canvas.height - y, Math.ceil(Math.abs(area.a.y - area.b.y) * ratio))
  if (w <= 0 || h <= 0) return undefined
  try {
    const data = context.getImageData(x, y, w, h).data
    // Average of the darkest pixels, so a single speck doesn't decide
    const pixels: Array<[number, number, number, number]> = []
    for (let i = 0; i < data.length; i += 4) {
      // Not rendered yet (transparent): no answer rather than black
      if (data[i + 3]! < 250) continue
      const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!]
      pixels.push([r * 0.299 + g * 0.587 + b * 0.114, r, g, b])
    }
    if (pixels.length === 0) return undefined
    pixels.sort((p, q) => p[0] - q[0])
    const darkest = pixels.slice(0, Math.max(1, Math.round(pixels.length * 0.05)))
    const mean = [1, 2, 3].map((k) =>
      Math.round(darkest.reduce((sum, pixel) => sum + pixel[k]!, 0) / darkest.length),
    )
    return `#${mean.map((value) => value.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return undefined
  }
}

function TextEditor({
  annotation,
  anchor,
  angle,
  scale,
  storedSize,
  onDone,
}: {
  annotation: TextAnnotation
  anchor: { x: number; y: number }
  angle: number
  scale: number
  storedSize: { width: number; height: number }
  onDone: (value: string) => void
}) {
  const [value, setValue] = useState(annotation.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  const fontSize = annotation.fontSize * scale
  const font = textFontCss(annotation)
  const lines = annotationTextLines(annotation, storedSize, value)
  const lineHeight = textLineHeight(annotation)
  const frameWidth = ((annotation.turns % 4) + 4) % 2 === 0 ? storedSize.width : storedSize.height
  // Paragraphs wrap at their width (a little extra keeps the browser from wrapping earlier)
  const widthPx = annotation.wrapWidth
    ? annotation.wrapWidth * frameWidth * scale + fontSize * 0.5
    : Math.max(
        fontSize * 4,
        ...lines.map(
          (line) => measureText(line, fontSize, font.weight, font.family, font.style) + fontSize,
        ),
      )
  const replacing = !!annotation.replaces

  useEffect(() => {
    const textarea = ref.current
    if (!textarea) return
    textarea.focus()
    // Existing PDF text: caret at the end for small corrections; new text: select all
    if (replacing) textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    else textarea.select()
  }, [replacing])

  const finish = () => {
    if (done.current) return
    done.current = true
    onDone(value)
  }

  return (
    <textarea
      ref={ref}
      value={value}
      aria-label="Text"
      spellCheck={false}
      className="border-primary absolute resize-none overflow-hidden rounded-none border border-dashed bg-white/70 p-0 outline-none"
      style={{
        left: anchor.x,
        top: anchor.y,
        width: widthPx,
        height: lines.length * fontSize * lineHeight + 2,
        fontSize,
        lineHeight,
        fontFamily: font.family,
        fontWeight: font.weight,
        fontStyle: font.style,
        color: annotation.color,
        transform: `rotate(${angle}deg)`,
        transformOrigin: '0 0',
        whiteSpace: annotation.wrapWidth ? 'pre-wrap' : 'pre',
        textAlign: annotation.wrapWidth ? (annotation.align ?? 'left') : undefined,
        overflowWrap: annotation.wrapWidth ? 'break-word' : undefined,
      }}
      onChange={(event) => setValue(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
          event.preventDefault()
          finish()
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  )
}
