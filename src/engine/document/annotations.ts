import type {
  Annotation,
  LineAnnotation,
  MarkupAnnotation,
  PagePoint,
  ShapeAnnotation,
  TextAnnotation,
} from '@/types/annotations'
import type { PageRef } from '@/types/document'

/** Font metrics shared by screen rendering and PDF export, so both look the same. */
export const TEXT_ASCENT = 0.8
export const TEXT_LINE_HEIGHT = 1.2
export const TEXT_FONT_FAMILY = 'Helvetica, Arial, sans-serif'
/** Opacity of highlight fills, on screen and in the export. */
export const MARKUP_OPACITY = 0.35

const mod4 = (value: number) => ((value % 4) + 4) % 4

/**
 * Maps a point of the unrotated page to the page displayed with `turns`
 * clockwise quarter turns (both as fractions, origin top left).
 */
export function toDisplay(point: PagePoint, turns: number): PagePoint {
  const { x, y } = point
  switch (mod4(turns)) {
    case 1:
      return { x: 1 - y, y: x }
    case 2:
      return { x: 1 - x, y: 1 - y }
    case 3:
      return { x: y, y: 1 - x }
    default:
      return { x, y }
  }
}

/** Inverse of {@link toDisplay}. */
export function toStored(point: PagePoint, turns: number): PagePoint {
  return toDisplay(point, 4 - mod4(turns))
}

/** Clockwise rotation (degrees) to draw a text with on a page displayed with `turns`. */
export function textDisplayAngle(text: TextAnnotation, turns: number): number {
  return mod4(turns - text.turns) * 90
}

export function textLines(text: string): string[] {
  return text.split('\n')
}

/** Moves an annotation by a delta given in *display* fractions. */
export function moveAnnotation(
  annotation: Annotation,
  dx: number,
  dy: number,
  turns: number,
): Annotation {
  const shift = (point: PagePoint) => {
    const display = toDisplay(point, turns)
    return toStored({ x: display.x + dx, y: display.y + dy }, turns)
  }
  if (annotation.type === 'text') return { ...annotation, at: shift(annotation.at) }
  if (isMarkup(annotation)) {
    return {
      ...annotation,
      rects: annotation.rects.map((rect) => ({ a: shift(rect.a), b: shift(rect.b) })),
    }
  }
  return { ...annotation, a: shift(annotation.a), b: shift(annotation.b) }
}

export function isMarkup(annotation: Annotation): annotation is MarkupAnnotation {
  return (
    annotation.type === 'highlight' ||
    annotation.type === 'underline' ||
    annotation.type === 'strikeout'
  )
}

/** Shapes and lines: annotations defined by two points that can be resized. */
export function isTwoPoint(annotation: Annotation): annotation is ShapeAnnotation | LineAnnotation {
  return (
    annotation.type === 'rect' ||
    annotation.type === 'ellipse' ||
    annotation.type === 'line' ||
    annotation.type === 'arrow'
  )
}

/** Unrotated page size in points from the displayed size and its quarter turns. */
export function unrotatedSize(display: { width: number; height: number }, turns: number) {
  return mod4(turns) % 2 === 0 ? display : { width: display.height, height: display.width }
}

/** Part of a text markup, in stored page space. Line thickness is in PDF points. */
export type MarkupPiece =
  | { kind: 'rect'; a: PagePoint; b: PagePoint }
  | { kind: 'line'; a: PagePoint; b: PagePoint; thickness: number }

/**
 * What to draw for a text markup: highlight rectangles, or lines below / through
 * each text line. Lines are placed in the orientation the text was marked in,
 * so they stay under the text when the page is rotated later.
 */
export function markupPieces(
  markup: MarkupAnnotation,
  size: { width: number; height: number },
): MarkupPiece[] {
  if (markup.type === 'highlight') {
    return markup.rects.map((rect) => ({ kind: 'rect', a: rect.a, b: rect.b }))
  }
  const turns = mod4(markup.turns)
  const frameHeight = turns % 2 === 0 ? size.height : size.width
  return markup.rects.map((rect) => {
    const a = toDisplay(rect.a, turns)
    const b = toDisplay(rect.b, turns)
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    const thickness = Math.max(0.75, (y1 - y0) * frameHeight * 0.07)
    // Underline sits just above the bottom of the line box, strike-through near the middle
    const y = y0 + (y1 - y0) * (markup.type === 'underline' ? 0.9 : 0.55)
    return {
      kind: 'line',
      a: toStored({ x: x0, y }, turns),
      b: toStored({ x: x1, y }, turns),
      thickness,
    }
  })
}

/** Axis-aligned box in any uniform unit (e.g. CSS pixels). */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Merges the rectangles of a text selection (many per line, one per text span)
 * into one box per line. Use a uniform unit such as pixels so horizontal gaps
 * compare to line heights: boxes are only joined when the gap between them is
 * small (words), not across columns.
 */
export function mergeLineRects(rects: readonly Box[]): Box[] {
  const boxes = rects
    .filter((box) => box.x1 - box.x0 > 0.5 && box.y1 - box.y0 > 0.5)
    .map((box) => ({ ...box }))
    .sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0)

  const lines: Box[] = []
  for (const box of boxes) {
    const height = box.y1 - box.y0
    const line = lines.find((other) => {
      const overlap = Math.min(other.y1, box.y1) - Math.max(other.y0, box.y0)
      const sameLine = overlap > 0.5 * Math.min(height, other.y1 - other.y0)
      const gap = Math.max(box.x0 - other.x1, other.x0 - box.x1)
      return sameLine && gap < 1.5 * height
    })
    if (line) {
      line.x0 = Math.min(line.x0, box.x0)
      line.x1 = Math.max(line.x1, box.x1)
      line.y0 = Math.min(line.y0, box.y0)
      line.y1 = Math.max(line.y1, box.y1)
    } else {
      lines.push(box)
    }
  }
  return lines
}

// ---------------------------------------------------------------------------
// Page list operations
// ---------------------------------------------------------------------------

function updatePage(
  pages: readonly PageRef[],
  pageId: string,
  change: (annotations: Annotation[]) => Annotation[],
): PageRef[] {
  return pages.map((page) => {
    if (page.id !== pageId) return page
    const annotations = change(page.annotations ?? [])
    if (annotations.length > 0) return { ...page, annotations }
    const cleared = { ...page }
    delete cleared.annotations
    return cleared
  })
}

export function addAnnotation(pages: readonly PageRef[], pageId: string, annotation: Annotation) {
  return updatePage(pages, pageId, (list) => [...list, annotation])
}

export function replaceAnnotation(
  pages: readonly PageRef[],
  pageId: string,
  annotation: Annotation,
) {
  return updatePage(pages, pageId, (list) =>
    list.map((item) => (item.id === annotation.id ? annotation : item)),
  )
}

export function removeAnnotation(pages: readonly PageRef[], pageId: string, id: string) {
  return updatePage(pages, pageId, (list) => list.filter((item) => item.id !== id))
}
