import type { PDFFont, PDFPage } from 'pdf-lib'
import type { Annotation, PagePoint, TextAnnotation } from '@/types/annotations'
import { TEXT_ASCENT, TEXT_LINE_HEIGHT, textLines, toDisplay, toStored } from './annotations'

type PdfLib = typeof import('pdf-lib')

/** Visible page box in PDF user space (origin bottom left, y up). */
export interface PageBox {
  x: number
  y: number
  width: number
  height: number
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  const number = Number.parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(number)) return [0, 0, 0]
  return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255]
}

/** Stored page fraction (origin top left) → PDF user space coordinates. */
export function toPdf(point: PagePoint, box: PageBox) {
  return { x: box.x + point.x * box.width, y: box.y + (1 - point.y) * box.height }
}

/** Replaces characters the standard PDF font can't encode (e.g. emoji) with "?". */
function encodable(font: PDFFont, text: string): string {
  return Array.from(text, (char) => {
    try {
      font.encodeText(char)
      return char
    } catch {
      return '?'
    }
  }).join('')
}

/**
 * Draws annotations permanently into a page's content. `box` is the page's
 * visible box before any crop, which annotation coordinates refer to.
 */
export function drawAnnotations(
  lib: PdfLib,
  page: PDFPage,
  annotations: readonly Annotation[],
  box: PageBox,
  font: PDFFont,
) {
  const { rgb, degrees, LineCapStyle } = lib

  for (const annotation of annotations) {
    const color = rgb(...hexToRgb(annotation.color))

    if (annotation.type === 'rect' || annotation.type === 'ellipse') {
      const a = toPdf(annotation.a, box)
      const b = toPdf(annotation.b, box)
      const x = Math.min(a.x, b.x)
      const y = Math.min(a.y, b.y)
      const width = Math.abs(a.x - b.x)
      const height = Math.abs(a.y - b.y)
      const fill = annotation.filled ? { color, opacity: 0.25 } : {}
      const border = { borderColor: color, borderWidth: annotation.strokeWidth, borderOpacity: 1 }
      if (annotation.type === 'rect') {
        page.drawRectangle({ x, y, width, height, ...border, ...fill })
      } else {
        page.drawEllipse({
          x: x + width / 2,
          y: y + height / 2,
          xScale: width / 2,
          yScale: height / 2,
          ...border,
          ...fill,
        })
      }
      continue
    }

    if (annotation.type === 'line' || annotation.type === 'arrow') {
      const start = toPdf(annotation.a, box)
      const end = toPdf(annotation.b, box)
      const line = { thickness: annotation.strokeWidth, color, lineCap: LineCapStyle.Round }
      page.drawLine({ start, end, ...line })
      if (annotation.type === 'arrow') {
        for (const [x, y] of arrowHead(start, end, annotation.strokeWidth)) {
          page.drawLine({ start: end, end: { x, y }, ...line })
        }
      }
      continue
    }

    if (annotation.type === 'text') drawText(page, annotation, box, font, color, degrees)
  }
}

/** The two short lines of an arrow head at `end`. */
export function arrowHead(
  start: { x: number; y: number },
  end: { x: number; y: number },
  strokeWidth: number,
): Array<[number, number]> {
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const length = Math.max(8, strokeWidth * 4)
  const spread = Math.PI / 7
  return [angle + Math.PI - spread, angle + Math.PI + spread].map((a) => [
    end.x + Math.cos(a) * length,
    end.y + Math.sin(a) * length,
  ])
}

/**
 * Where each text line starts (baseline, PDF user space) and its rotation.
 * Lines are laid out in the orientation the text was written in, then mapped
 * back onto the unrotated page.
 */
export function textBaselines(text: TextAnnotation, box: PageBox) {
  const turns = ((text.turns % 4) + 4) % 4
  const height = turns % 2 === 0 ? box.height : box.width
  const anchor = toDisplay(text.at, turns)
  return textLines(text.text).map((line, index) => {
    const baseline = toStored(
      {
        x: anchor.x,
        y: anchor.y + (text.fontSize * (TEXT_ASCENT + index * TEXT_LINE_HEIGHT)) / height,
      },
      turns,
    )
    // The page is shown turned clockwise; counter-rotating keeps the text upright
    return { line, ...toPdf(baseline, box), rotate: turns * 90 }
  })
}

function drawText(
  page: PDFPage,
  text: TextAnnotation,
  box: PageBox,
  font: PDFFont,
  color: ReturnType<PdfLib['rgb']>,
  degrees: PdfLib['degrees'],
) {
  for (const { line, x, y, rotate } of textBaselines(text, box)) {
    if (!line) continue
    page.drawText(encodable(font, line), {
      x,
      y,
      size: text.fontSize,
      font,
      color,
      rotate: degrees(rotate),
    })
  }
}
