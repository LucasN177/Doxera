import type {
  Annotation,
  WatermarkAnnotation,
  ImageAnnotation,
  LineAnnotation,
  MarkupAnnotation,
  RedactAnnotation,
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
  if (annotation.type === 'text' || annotation.type === 'note') {
    return { ...annotation, at: shift(annotation.at) }
  }
  if (isMarkup(annotation)) {
    return {
      ...annotation,
      rects: annotation.rects.map((rect) => ({ a: shift(rect.a), b: shift(rect.b) })),
    }
  }
  if (annotation.type === 'ink') return { ...annotation, points: annotation.points.map(shift) }
  // Watermarks are always centered on the page
  if (annotation.type === 'watermark') return annotation
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

/** Annotations with two corner points that can be moved and resized. */
export function hasCorners(
  annotation: Annotation,
): annotation is ShapeAnnotation | LineAnnotation | ImageAnnotation | RedactAnnotation {
  return isTwoPoint(annotation) || annotation.type === 'image' || annotation.type === 'redact'
}

/**
 * Where to draw an image in PDF terms: bottom-left corner (fractions of the
 * unrotated page), size in points and counter-clockwise rotation. The image is
 * laid out upright in the orientation it was inserted in.
 */
export function imagePlacement(image: ImageAnnotation, size: { width: number; height: number }) {
  const turns = mod4(image.turns)
  const frameWidth = turns % 2 === 0 ? size.width : size.height
  const frameHeight = turns % 2 === 0 ? size.height : size.width
  const a = toDisplay(image.a, turns)
  const b = toDisplay(image.b, turns)
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return {
    origin: toStored({ x: x0, y: y1 }, turns),
    width: (x1 - x0) * frameWidth,
    height: (y1 - y0) * frameHeight,
    rotate: turns * 90,
  }
}

/** Clockwise rotation (degrees) of an image's content on a page displayed with `turns`. */
export function imageDisplayAngle(image: ImageAnnotation, turns: number): number {
  return mod4(turns - image.turns) * 90
}

// ---------------------------------------------------------------------------
// Freehand ink
// ---------------------------------------------------------------------------

/** Squared distance of point p to the segment a–b. */
function segmentDistanceSquared(p: PagePoint, a: PagePoint, b: PagePoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared
  const clamped = Math.max(0, Math.min(1, t))
  const x = a.x + clamped * dx - p.x
  const y = a.y + clamped * dy - p.y
  return x * x + y * y
}

/**
 * Ramer–Douglas–Peucker simplification: drops points that lie within
 * `tolerance` of the line through their neighbours. Keeps strokes small
 * without visibly changing them.
 */
export function simplifyPoints(points: readonly PagePoint[], tolerance: number): PagePoint[] {
  if (points.length <= 2) return [...points]
  const toleranceSquared = tolerance * tolerance
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    let index = -1
    let max = toleranceSquared
    for (let i = start + 1; i < end; i++) {
      const distance = segmentDistanceSquared(points[i], points[start], points[end])
      if (distance > max) {
        max = distance
        index = i
      }
    }
    if (index !== -1) {
      keep[index] = true
      stack.push([start, index], [index, end])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Smooth SVG path through the points: quadratic curves between the midpoints
 * of consecutive segments. Works for screen pixels and PDF points alike.
 */
export function smoothPath(points: ReadonlyArray<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  const f = (n: number) => Math.round(n * 100) / 100
  const [first] = points
  if (points.length === 1)
    return `M ${f(first.x)} ${f(first.y)} L ${f(first.x + 0.01)} ${f(first.y)}`
  if (points.length === 2) {
    return `M ${f(first.x)} ${f(first.y)} L ${f(points[1].x)} ${f(points[1].y)}`
  }
  let d = `M ${f(first.x)} ${f(first.y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i]
    const next = points[i + 1]
    d += ` Q ${f(current.x)} ${f(current.y)} ${f((current.x + next.x) / 2)} ${f((current.y + next.y) / 2)}`
  }
  const last = points[points.length - 1]
  return `${d} L ${f(last.x)} ${f(last.y)}`
}

/** Opacity and width factor of the marker (highlighter-like) ink. */
export const MARKER_OPACITY = 0.4

// ---------------------------------------------------------------------------
// Watermarks
// ---------------------------------------------------------------------------

/** Font size so the watermark text spans `size` × page width (in its orientation). */
export function watermarkFontSize(
  watermark: WatermarkAnnotation,
  frameWidth: number,
  textWidthAtSize1: number,
): number {
  return (watermark.size * frameWidth) / Math.max(0.01, textWidthAtSize1)
}

/** Cap height relative to the font size, used to center text vertically. */
export const WATERMARK_CAP_HEIGHT = 0.7

/**
 * Replaces the watermark of the given pages: `create` returns the new
 * watermark for a page, or null to remove it. Other annotations stay.
 */
export function setWatermarks(
  pages: readonly PageRef[],
  ids: ReadonlySet<string>,
  create: (page: PageRef) => WatermarkAnnotation | null,
): PageRef[] {
  return pages.map((page) => {
    if (!ids.has(page.id)) return page
    const others = (page.annotations ?? []).filter((item) => item.type !== 'watermark')
    const watermark = create(page)
    // Watermarks go first so they are drawn below everything else
    const annotations = watermark ? [watermark, ...others] : others
    if (annotations.length > 0) return { ...page, annotations }
    const cleared = { ...page }
    delete cleared.annotations
    return cleared
  })
}

/** Fill of redactions (MuPDF draws the same black box on export). */
export const REDACT_COLOR = '#000000'
