import type { RawPageText } from '@/engine/mupdf/pageContent'
import type { ImageAnnotation, PageRect, TextAnnotation } from '@/types/annotations'
import type { PageRef } from '@/types/document'
import { joinLines } from '@/engine/text/structure'
import { classifyFont, REDACT_COLOR, TEXT_ASCENT, toDisplay, toStored } from './annotations'

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
  /** Parts separated by wide gaps (e.g. table cells), as x fractions of the page. */
  segments?: Array<{ text: string; x0: number; x1: number }>
  /**
   * Set for paragraphs (see {@link toEditableParagraphs}): the single lines,
   * the width to wrap at and the distance between baselines.
   */
  paragraph?: { lines: PageRect[]; wrapWidth: number; lineHeight: number }
  /** Invisible text, e.g. recognized text over a scan (see `RawTextLine.invisible`). */
  invisible?: boolean
}

const SAME_SIZE = 0.35

/** Whether two lines look alike (font, size, style, color). */
function sameStyle(a: EditableLine, b: EditableLine): boolean {
  return (
    Math.abs(a.fontSize - b.fontSize) <= SAME_SIZE &&
    a.font === b.font &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.color === b.color &&
    !!a.invisible === !!b.invisible
  )
}

/**
 * Groups lines into paragraphs so they can be edited as a whole: lines of the
 * same style directly below each other (even spacing), in the same column,
 * where every line but the last runs (nearly) to the right edge of the
 * paragraph. Table rows (lines with gaps) and single lines stay as they are.
 *
 * @param size Size of the unrotated page in points.
 */
export function toEditableParagraphs(
  lines: readonly EditableLine[],
  size: { width: number; height: number },
): EditableLine[] {
  const sorted = [...lines].sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
  const used = new Set<EditableLine>()
  const result: EditableLine[] = []
  const isTableRow = (line: EditableLine) => (line.segments?.length ?? 0) > 1

  for (const first of sorted) {
    if (used.has(first)) continue
    used.add(first)
    const group = [first]
    if (!isTableRow(first)) {
      let gap = 0
      for (;;) {
        const last = group[group.length - 1]!
        const fontSize = last.fontSize
        // The nearest line below in the same column
        const next = sorted.find(
          (line) =>
            !used.has(line) &&
            line.at.y > last.at.y &&
            line.rect.a.x < last.rect.b.x &&
            last.rect.a.x < line.rect.b.x,
        )
        if (!next || isTableRow(next) || !sameStyle(first, next)) break
        const distance = (next.at.y - last.at.y) * size.height
        if (distance < fontSize * 0.95 || distance > fontSize * 1.9) break
        if (gap && Math.abs(distance - gap) > fontSize * 0.2) break
        // Left edges line up (the first line may be indented)
        const left = group.length === 1 ? group[0]!.rect.a.x : group[1]!.rect.a.x
        const indent = (next.rect.a.x - left) * size.width
        if (indent > fontSize * 0.6 || indent < -fontSize * (group.length === 1 ? 4 : 0.6)) break
        // A clearly shorter line ended the paragraph before it
        const right = Math.max(...group.map((line) => line.rect.b.x), next.rect.b.x)
        if ((right - last.rect.b.x) * size.width > fontSize * 4) break
        gap = distance
        used.add(next)
        group.push(next)
      }
    }
    if (group.length === 1) {
      result.push(first)
      continue
    }
    const left = Math.min(...group.map((line) => line.at.x))
    const right = Math.max(...group.map((line) => line.rect.b.x))
    const baselineGap = (group[group.length - 1]!.at.y - first.at.y) / (group.length - 1)
    result.push({
      ...first,
      segments: undefined,
      text: group.slice(1).reduce((text, line) => joinLines(text, line.text), first.text),
      at: { x: left, y: first.at.y },
      rect: {
        a: { x: Math.min(...group.map((line) => line.rect.a.x)), y: first.rect.a.y },
        b: { x: right, y: Math.max(...group.map((line) => line.rect.b.y)) },
      },
      paragraph: {
        lines: group.map((line) => line.rect),
        // A little room, as the export font may run slightly wider than the original
        wrapWidth: right - left + 1 / size.width,
        lineHeight: Math.round(((baselineGap * size.height) / first.fontSize) * 100) / 100,
      },
    })
  }
  return result
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
      ...(line.invisible && { invisible: true }),
      segments: (line.segments ?? []).map((segment) => {
        const along = (t: number) =>
          stored(line.origin[0] + line.direction[0] * t, line.origin[1] + line.direction[1] * t).x
        return { text: segment.text, x0: along(segment.start), x1: along(segment.end) }
      }),
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

/** A text annotation that replaces an existing line or paragraph, starting with the same text and style. */
export function replacementFor(line: EditableLine, id: string): TextAnnotation {
  return {
    ...(line.invisible && { coverOriginal: true }),
    ...(line.paragraph && {
      replacesLines: line.paragraph.lines,
      wrapWidth: line.paragraph.wrapWidth,
      lineHeight: line.paragraph.lineHeight,
    }),
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

/** The original lines a text annotation replaces (one, or all lines of a paragraph). */
export function replacedLines(text: TextAnnotation): PageRect[] {
  return text.replacesLines ?? (text.replaces ? [text.replaces] : [])
}

/** Whether any page replaces existing text. */
export function hasTextReplacements(pages: readonly PageRef[]): boolean {
  return pages.some((page) =>
    page.annotations?.some((item) => item.type === 'text' && item.replaces),
  )
}

/**
 * Pages for the first export stage: the same pages, unrotated and uncropped,
 * with a redaction area for every replaced text line. The areas are shrunk a
 * little vertically so neighbouring lines stay untouched. Replaced images are
 * hidden in this stage too, while their resource names are still the
 * original ones (MuPDF may rename resources when it rewrites the page).
 */
export function textRemovalPages(pages: readonly PageRef[]): PageRef[] {
  return pages.map((page) => {
    const removals = (page.annotations ?? []).flatMap((item) => {
      if (item.type !== 'text' || !item.replaces) return []
      return replacedLines(item).map(({ a, b }, index) => {
        const inset = (b.y - a.y) * 0.15
        return {
          id: `${item.id}-${index}`,
          type: 'redact' as const,
          color: REDACT_COLOR,
          a: { x: a.x, y: a.y + inset },
          b: { x: b.x, y: b.y - inset },
        }
      })
    })
    const hiddenImages = (page.annotations ?? []).flatMap((item) =>
      item.type === 'image' && item.xobject ? [{ ...item, removed: true }] : [],
    )
    const annotations = [...removals, ...hiddenImages]
    return {
      id: page.id,
      sourceId: page.sourceId,
      sourceIndex: page.sourceIndex,
      rotation: 0,
      ...(annotations.length > 0 && { annotations }),
    }
  })
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** An image of the PDF that can be moved, resized or removed, in stored page fractions. */
export interface EditableImage {
  /** Position among the page's images, to fetch its pixels. */
  index: number
  rect: PageRect
  /** Quarter turns of the page display in which the image is upright. */
  turns: number
  xobject: string
  width: number
  height: number
}

/**
 * Converts MuPDF's images into stored page fractions. Only images that can be
 * identified in the page resources and are drawn upright in a quarter-turn
 * orientation (not skewed or mirrored) are returned.
 */
export function toEditableImages(raw: RawPageText, rotate = 0): EditableImage[] {
  const [bx0, by0, bx1, by1] = raw.bounds
  const width = bx1 - bx0
  const height = by1 - by0
  const pageTurns = Math.round(rotate / 90)
  const stored = (x: number, y: number) =>
    toStored({ x: (x - bx0) / width, y: (y - by0) / height }, pageTurns)

  const images: EditableImage[] = []
  for (const image of raw.images) {
    if (!image.xobject) continue
    const [a, b, c, d, e, f] = image.transform
    const origin = stored(e, f)
    const xEnd = stored(e + a, f + b)
    const yEnd = stored(e + c, f + d)
    // Find the display orientation in which the image's x axis points right and its y axis down
    const turns = [0, 1, 2, 3].find((k) => {
      const o = toDisplay(origin, k)
      const u = toDisplay(xEnd, k)
      const v = toDisplay(yEnd, k)
      const ux = u.x - o.x
      const uy = u.y - o.y
      const vx = v.x - o.x
      const vy = v.y - o.y
      return ux > 0 && vy > 0 && Math.abs(uy) < ux * 0.02 && Math.abs(vx) < vy * 0.02
    })
    if (turns === undefined) continue

    const p = stored(image.bbox[0], image.bbox[1])
    const q = stored(image.bbox[2], image.bbox[3])
    images.push({
      index: image.index,
      rect: {
        a: { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y) },
        b: { x: Math.max(p.x, q.x), y: Math.max(p.y, q.y) },
      },
      turns,
      xobject: image.xobject,
      width: image.width,
      height: image.height,
    })
  }
  return images
}

/** An image annotation that takes the place of an existing image (same position and size). */
export function imageReplacementFor(
  image: EditableImage,
  assetId: string,
  id: string,
): ImageAnnotation {
  return {
    id,
    type: 'image',
    color: '#000000',
    a: image.rect.a,
    b: image.rect.b,
    assetId,
    turns: image.turns,
    replaces: image.rect,
    xobject: image.xobject,
  }
}

/** Whether any page replaces or removes an existing image. */
export function hasImageReplacements(pages: readonly PageRef[]): boolean {
  return pages.some((page) =>
    page.annotations?.some((item) => item.type === 'image' && item.xobject),
  )
}
