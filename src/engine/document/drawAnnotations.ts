import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import type {
  Annotation,
  NoteAnnotation,
  RedactAnnotation,
  PagePoint,
  TextAnnotation,
  WatermarkAnnotation,
} from '@/types/annotations'
import {
  imagePlacement,
  MARKER_OPACITY,
  smoothPath,
  WATERMARK_CAP_HEIGHT,
  watermarkFontSize,
  isMarkup,
  MARKUP_OPACITY,
  markupPieces,
  TEXT_ASCENT,
  TEXT_LINE_HEIGHT,
  textLines,
  toDisplay,
  toStored,
  standardFontName,
} from './annotations'

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
  images: ReadonlyMap<string, PDFImage> = new Map(),
  /** Bold font for watermarks. */
  boldFont: PDFFont = font,
  /** Fonts for text annotations, by standard font name (see `standardFontName`). */
  textFonts: ReadonlyMap<string, PDFFont> = new Map(),
) {
  const { rgb, degrees, LineCapStyle, BlendMode } = lib

  for (const annotation of annotations) {
    // Notes become real PDF comments (addNoteAnnotations), redactions are
    // applied by MuPDF after building (addRedactAnnotations)
    if (annotation.type === 'note' || annotation.type === 'redact') continue

    if (annotation.type === 'ink') {
      // SVG coordinates (y down) relative to the top-left corner of the page box
      const d = smoothPath(
        annotation.points.map((point) => ({ x: point.x * box.width, y: point.y * box.height })),
      )
      page.drawSvgPath(d, {
        x: box.x,
        y: box.y + box.height,
        borderColor: rgb(...hexToRgb(annotation.color)),
        borderWidth: annotation.strokeWidth,
        borderLineCap: LineCapStyle.Round,
        borderOpacity: annotation.marker ? MARKER_OPACITY : 1,
        blendMode: annotation.marker ? BlendMode.Multiply : undefined,
      })
      continue
    }

    if (annotation.type === 'watermark') {
      drawWatermark(lib, page, annotation, box, boldFont, images)
      continue
    }

    if (annotation.type === 'image') {
      const image = images.get(annotation.assetId)
      if (!image) continue
      const placement = imagePlacement(annotation, box)
      const { x, y } = toPdf(placement.origin, box)
      page.drawImage(image, {
        x,
        y,
        width: placement.width,
        height: placement.height,
        rotate: degrees(placement.rotate),
      })
      continue
    }
    const color = rgb(...hexToRgb(annotation.color))

    if (isMarkup(annotation)) {
      for (const piece of markupPieces(annotation, box)) {
        const a = toPdf(piece.a, box)
        const b = toPdf(piece.b, box)
        if (piece.kind === 'rect') {
          page.drawRectangle({
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(a.x - b.x),
            height: Math.abs(a.y - b.y),
            color,
            opacity: MARKUP_OPACITY,
            // Like a highlighter: the text below stays dark and readable
            blendMode: BlendMode.Multiply,
          })
        } else {
          page.drawLine({ start: a, end: b, thickness: piece.thickness, color })
        }
      }
      continue
    }

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

    if (annotation.type === 'text') {
      const textFont = textFonts.get(standardFontName(annotation)) ?? font
      drawText(page, annotation, box, textFont, color, degrees)
    }
  }
}

/**
 * Watermark centered on the page, laid out in the orientation it was added in
 * and rotated by its angle around the center.
 */
function drawWatermark(
  lib: PdfLib,
  page: PDFPage,
  watermark: WatermarkAnnotation,
  box: PageBox,
  font: PDFFont,
  images: ReadonlyMap<string, PDFImage>,
) {
  const turns = ((watermark.turns % 4) + 4) % 4
  const frameWidth = turns % 2 === 0 ? box.width : box.height
  const frameHeight = turns % 2 === 0 ? box.height : box.width
  const image = watermark.assetId ? images.get(watermark.assetId) : undefined

  let width: number
  let height: number
  let fontSize = 0
  if (image) {
    width = watermark.size * frameWidth
    height = (width * image.height) / Math.max(1, image.width)
  } else {
    fontSize = watermarkFontSize(watermark, frameWidth, font.widthOfTextAtSize(watermark.text, 1))
    width = font.widthOfTextAtSize(watermark.text, fontSize)
    height = fontSize * WATERMARK_CAP_HEIGHT
  }

  // Bottom-left start point in the (y-up) frame: center minus the rotated half size
  const angle = (watermark.angle * Math.PI) / 180
  const cx = frameWidth / 2
  const cy = frameHeight / 2
  const sx = cx - (width / 2) * Math.cos(angle) + (height / 2) * Math.sin(angle)
  const sy = cy - (width / 2) * Math.sin(angle) - (height / 2) * Math.cos(angle)
  const start = toStored({ x: sx / frameWidth, y: 1 - sy / frameHeight }, turns)
  const { x, y } = toPdf(start, box)
  const rotate = lib.degrees(watermark.angle + turns * 90)

  if (image) {
    page.drawImage(image, { x, y, width, height, rotate, opacity: watermark.opacity })
  } else if (watermark.text.trim()) {
    page.drawText(encodable(font, watermark.text), {
      x,
      y,
      size: fontSize,
      font,
      color: lib.rgb(...hexToRgb(watermark.color)),
      opacity: watermark.opacity,
      rotate,
    })
  }
}

/** Size of the note icon in PDF points. */
export const NOTE_ICON_SIZE = 20

/**
 * Adds notes as standard PDF text annotations ("sticky notes"), so other PDF
 * programs show them as comments that open on click. The icon doesn't scale or
 * rotate with the page, like in Doxera.
 */
export function addNoteAnnotations(
  lib: PdfLib,
  page: PDFPage,
  notes: readonly NoteAnnotation[],
  box: PageBox,
) {
  const { PDFHexString, PDFString } = lib
  const context = page.doc.context
  for (const note of notes) {
    const { x, y } = toPdf(note.at, box)
    const annotation = context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [x, y - NOTE_ICON_SIZE, x + NOTE_ICON_SIZE, y],
      Contents: PDFHexString.fromText(note.text),
      T: PDFHexString.fromText('Doxera'),
      M: PDFString.fromDate(new Date(note.updatedAt)),
      CreationDate: PDFString.fromDate(new Date(note.createdAt)),
      Name: 'Comment',
      C: hexToRgb(note.color),
      // Print | NoZoom | NoRotate
      F: 4 | 8 | 16,
      Open: false,
    })
    page.node.addAnnot(context.register(annotation))
  }
}

/**
 * Marks areas for redaction with standard /Redact annotations. They are not
 * applied yet: MuPDF removes the content below them afterwards (see
 * `applyRedactions`), which also deletes these annotations.
 */
export function addRedactAnnotations(
  page: PDFPage,
  redactions: readonly RedactAnnotation[],
  box: PageBox,
) {
  const context = page.doc.context
  for (const redaction of redactions) {
    const a = toPdf(redaction.a, box)
    const b = toPdf(redaction.b, box)
    const x0 = Math.min(a.x, b.x)
    const y0 = Math.min(a.y, b.y)
    const x1 = Math.max(a.x, b.x)
    const y1 = Math.max(a.y, b.y)
    const annotation = context.obj({
      Type: 'Annot',
      Subtype: 'Redact',
      Rect: [x0, y0, x1, y1],
      // Upper left, upper right, lower left, lower right
      QuadPoints: [x0, y1, x1, y1, x0, y0, x1, y0],
      IC: [0, 0, 0],
    })
    page.node.addAnnot(context.register(annotation))
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
