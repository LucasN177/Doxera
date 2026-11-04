import { MessageSquareText } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  addAnnotation,
  isMarkup,
  isTwoPoint,
  MARKUP_OPACITY,
  markupPieces,
  moveAnnotation,
  removeAnnotation,
  replaceAnnotation,
  TEXT_ASCENT,
  TEXT_FONT_FAMILY,
  TEXT_LINE_HEIGHT,
  textDisplayAngle,
  textLines,
  toDisplay,
  toStored,
  unrotatedSize,
} from '@/engine/document/annotations'
import { arrowHead, NOTE_ICON_SIZE } from '@/engine/document/drawAnnotations'
import { cn } from '@/lib/utils'
import {
  NOTE_DEFAULT_COLOR,
  useAnnotationStore,
  type AnnotationTool,
} from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { Annotation, NoteAnnotation, PagePoint, TextAnnotation } from '@/types/annotations'
import type { PageRef, ResolvedPage } from '@/types/document'

type Handle = 'a' | 'b' | 'nw' | 'ne' | 'sw' | 'se'

type Drag =
  | { kind: 'create'; original: Annotation }
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
function measureText(text: string, fontSizePx: number): number {
  measureContext ??= document.createElement('canvas').getContext('2d')
  if (!measureContext) return text.length * fontSizePx * 0.55
  measureContext.font = `${fontSizePx}px ${TEXT_FONT_FAMILY}`
  return measureContext.measureText(text).width
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
    const at = toStored(pointFrom(event), turns)
    const id = crypto.randomUUID()
    const { color, strokeWidth, filled, fontSize } = useAnnotationStore.getState().style

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
      const text: TextAnnotation = { id, type: 'text', color, at, text: '', fontSize, turns }
      setDraft(text)
      useAnnotationStore.getState().setTool('select')
      useAnnotationStore.getState().setEditing({ pageId, id })
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const original: Annotation =
      tool === 'rect' || tool === 'ellipse'
        ? { id, type: tool, color, a: at, b: at, strokeWidth, filled }
        : {
            id,
            type: tool as Exclude<AnnotationTool, 'select' | 'text' | 'note' | 'rect' | 'ellipse'>,
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
    if (current.kind === 'create' && isTwoPoint(current.original)) {
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
      setDraft(resize(current.original, current.handle, point, turns))
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
    if (!text) {
      if (exists) commit((pages) => removeAnnotation(pages, pageId, editingText.id))
    } else if (exists) {
      if (text !== editingText.text) {
        commit((pages) => replaceAnnotation(pages, pageId, { ...editingText, text }))
      }
    } else {
      commit((pages) => addAnnotation(pages, pageId, { ...editingText, text }))
    }
    setDraft(null)
    useAnnotationStore.getState().setEditing(null)
    if (text) useAnnotationStore.getState().select({ pageId, id: editingText.id })
  }

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
          pointerEvents: drawing ? 'all' : 'none',
          cursor: drawing ? (tool === 'text' ? 'text' : 'crosshair') : undefined,
          touchAction: drawing ? 'none' : undefined,
        }}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-annotation-layer
        aria-hidden={!active}
      >
        {shown.map((annotation) => {
          if (annotation.id === editingHere || annotation.type === 'note') return null
          const box = boundingBox(annotation, px, scale, turns)
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
  if (!isTwoPoint(annotation)) return false
  const a = toDisplay(annotation.a, turns)
  const b = toDisplay(annotation.b, turns)
  return Math.abs(a.x - b.x) < MIN_SIZE && Math.abs(a.y - b.y) < MIN_SIZE
}

function resize(
  annotation: Annotation,
  handle: Handle,
  point: PagePoint,
  turns: number,
): Annotation {
  if (!isTwoPoint(annotation)) return annotation
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

function boundingBox(
  annotation: Annotation,
  px: (point: PagePoint) => { x: number; y: number },
  scale: number,
  turns: number,
): Box {
  if (annotation.type === 'text') {
    const anchor = px(annotation.at)
    const fontSize = annotation.fontSize * scale
    const lines = textLines(annotation.text)
    const w = Math.max(fontSize * 0.5, ...lines.map((line) => measureText(line, fontSize)))
    const h = lines.length * fontSize * TEXT_LINE_HEIGHT
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

  if (annotation.type === 'text') {
    const anchor = px(annotation.at)
    const fontSize = annotation.fontSize * scale
    return (
      <g transform={`rotate(${textDisplayAngle(annotation, turns)} ${anchor.x} ${anchor.y})`}>
        {textLines(annotation.text).map((line, index) => (
          <text
            key={index}
            x={anchor.x}
            y={anchor.y + fontSize * (TEXT_ASCENT + index * TEXT_LINE_HEIGHT)}
            fill={color}
            fontSize={fontSize}
            fontFamily={TEXT_FONT_FAMILY}
            style={{ whiteSpace: 'pre' }}
          >
            {line}
          </text>
        ))}
      </g>
    )
  }

  if (annotation.type === 'note') return null

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
  } else if (annotation.type !== 'text') {
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

function TextEditor({
  annotation,
  anchor,
  angle,
  scale,
  onDone,
}: {
  annotation: TextAnnotation
  anchor: { x: number; y: number }
  angle: number
  scale: number
  onDone: (value: string) => void
}) {
  const [value, setValue] = useState(annotation.text)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  const fontSize = annotation.fontSize * scale
  const lines = textLines(value)
  const widthPx = Math.max(
    fontSize * 4,
    ...lines.map((line) => measureText(line, fontSize) + fontSize),
  )

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

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
        height: lines.length * fontSize * TEXT_LINE_HEIGHT + 2,
        fontSize,
        lineHeight: TEXT_LINE_HEIGHT,
        fontFamily: TEXT_FONT_FAMILY,
        color: annotation.color,
        transform: `rotate(${angle}deg)`,
        transformOrigin: '0 0',
        whiteSpace: 'pre',
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
