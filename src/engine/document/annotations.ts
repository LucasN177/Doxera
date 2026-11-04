import type { Annotation, PagePoint, TextAnnotation } from '@/types/annotations'
import type { PageRef } from '@/types/document'

/** Font metrics shared by screen rendering and PDF export, so both look the same. */
export const TEXT_ASCENT = 0.8
export const TEXT_LINE_HEIGHT = 1.2
export const TEXT_FONT_FAMILY = 'Helvetica, Arial, sans-serif'

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
  return { ...annotation, a: shift(annotation.a), b: shift(annotation.b) }
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
