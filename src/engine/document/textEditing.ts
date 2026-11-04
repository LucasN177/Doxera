import type { RawPageText } from '@/engine/mupdf/textLines'
import type { PageRect, TextAnnotation } from '@/types/annotations'
import type { PageRef } from '@/types/document'
import { classifyFont, REDACT_COLOR, TEXT_ASCENT, toStored } from './annotations'

/** A line of existing PDF text that can be edited, in stored page fractions. */
export interface EditableLine {
  text: string
  /** Area covered by the line's glyphs. */
  rect: PageRect
  /** Top-left corner of the text box (baseline minus ascent). */
  at: { x: number; y: number }
  fontSize: number
  color: string
  font: NonNullable<TextAnnotation['font']>
  bold: boolean
  italic: boolean
}

function toHex(color: readonly number[]): string {
  // Gray (1 value), RGB (3) or CMYK (4)
  const [r, g, b] =
    color.length === 1
      ? [color[0], color[0], color[0]]
      : color.length === 4
        ? [0, 1, 2].map((i) => (1 - color[i]) * (1 - color[3]))
        : color
  return `#${[r, g, b]
    .map((value) =>
      Math.round(Math.min(1, Math.max(0, value ?? 0)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/**
 * Converts MuPDF's text lines (page space with the page's own rotation
 * applied) into stored page fractions. Only lines that run left to right on
 * the unrotated page are returned; those can be replaced by a text annotation.
 *
 * @param rotate The page's own /Rotate in degrees.
 */
export function toEditableLines(raw: RawPageText, rotate = 0): EditableLine[] {
  const [bx0, by0, bx1, by1] = raw.bounds
  const width = bx1 - bx0
  const height = by1 - by0
  const turns = Math.round(rotate / 90)
  // Size of the unrotated page in points
  const storedHeight = turns % 2 === 0 ? height : width
  const stored = (x: number, y: number) =>
    toStored({ x: (x - bx0) / width, y: (y - by0) / height }, turns)

  const lines: EditableLine[] = []
  for (const line of raw.lines) {
    if (line.size <= 0) continue
    // Direction on the unrotated page: only horizontal, left-to-right text
    const start = stored(line.origin[0], line.origin[1])
    const end = stored(line.origin[0] + line.direction[0], line.origin[1] + line.direction[1])
    const dx = end.x - start.x
    const dy = end.y - start.y
    if (dx <= 0 || Math.abs(dy) > Math.abs(dx) * 0.05) continue

    const a = stored(line.bbox[0], line.bbox[1])
    const b = stored(line.bbox[2], line.bbox[3])
    const rect = {
      a: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      b: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
    }
    lines.push({
      text: line.text,
      rect,
      at: { x: start.x, y: start.y - (line.size * TEXT_ASCENT) / storedHeight },
      fontSize: Math.round(line.size * 10) / 10,
      color: toHex(line.color),
      ...classifyFont(line.fontName),
    })
  }
  return lines
}

/** True if two page rectangles are (almost) the same. */
export function sameRect(first: PageRect, second: PageRect, tolerance = 0.002): boolean {
  return (
    Math.abs(first.a.x - second.a.x) < tolerance &&
    Math.abs(first.a.y - second.a.y) < tolerance &&
    Math.abs(first.b.x - second.b.x) < tolerance &&
    Math.abs(first.b.y - second.b.y) < tolerance
  )
}

/** A text annotation that replaces an existing line, starting with the same text and style. */
export function replacementFor(line: EditableLine, id: string): TextAnnotation {
  return {
    id,
    type: 'text',
    color: line.color,
    at: line.at,
    text: line.text,
    fontSize: line.fontSize,
    // Original text runs along the unrotated page
    turns: 0,
    font: line.font,
    bold: line.bold,
    italic: line.italic,
    replaces: line.rect,
  }
}

/** Whether any page replaces existing text. */
export function hasTextReplacements(pages: readonly PageRef[]): boolean {
  return pages.some((page) =>
    page.annotations?.some((item) => item.type === 'text' && item.replaces),
  )
}

/**
 * Pages for the first export stage: the same pages, unrotated and uncropped,
 * with a redaction area for every replaced text line (and nothing else). The
 * areas are shrunk a little vertically so neighbouring lines stay untouched.
 */
export function textRemovalPages(pages: readonly PageRef[]): PageRef[] {
  return pages.map((page) => {
    const removals = (page.annotations ?? []).flatMap((item) => {
      if (item.type !== 'text' || !item.replaces) return []
      const { a, b } = item.replaces
      const inset = (b.y - a.y) * 0.15
      return [
        {
          id: item.id,
          type: 'redact' as const,
          color: REDACT_COLOR,
          a: { x: a.x, y: a.y + inset },
          b: { x: b.x, y: b.y - inset },
        },
      ]
    })
    return {
      id: page.id,
      sourceId: page.sourceId,
      sourceIndex: page.sourceIndex,
      rotation: 0,
      ...(removals.length > 0 && { annotations: removals }),
    }
  })
}
