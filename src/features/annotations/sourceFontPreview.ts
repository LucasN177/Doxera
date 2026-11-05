import type { PDFDocument } from 'pdf-lib'
import { layoutText, textLineHeight, toDisplay, toStored } from '@/engine/document/annotations'
import { drawAnnotations, sourceFontKey } from '@/engine/document/drawAnnotations'
import { embedSourceFont, measureSourceFont, sourceFontCovers } from '@/engine/fonts/pdfFontInfo'
import { closePdf, openPdf } from '@/engine/render/pdfjs'
import { useDocumentStore } from '@/stores/documentStore'
import type { PageRect, TextAnnotation } from '@/types/annotations'

/** Whether a text is shown (and exported) with its original embedded font. */
export function usesSourceFont(text: TextAnnotation): boolean {
  return !!text.sourceFont && sourceFontCovers(text.sourceFont, text.text)
}

const parsed = new WeakMap<Uint8Array, Promise<PDFDocument>>()

/** Area of a text annotation (with some room for overhanging glyphs), in stored fractions. */
function textArea(text: TextAnnotation, size: { width: number; height: number }): PageRect {
  const sideways = ((text.turns % 2) + 2) % 2 === 1
  const frame = sideways ? { width: size.height, height: size.width } : size
  const measure = (line: string) => measureSourceFont(text.sourceFont!, line, text.fontSize) ?? 0
  const lines = layoutText(text, measure, frame.width)
  const width = text.wrapWidth
    ? text.wrapWidth * frame.width
    : Math.max(...lines.map((line) => measure(line.text)))
  const height = (lines.length - 1) * textLineHeight(text) * text.fontSize + text.fontSize * 1.1
  const pad = text.fontSize * 0.5
  const anchor = toDisplay(text.at, text.turns)
  const a = toStored(
    { x: anchor.x - pad / frame.width, y: anchor.y - pad / frame.height },
    text.turns,
  )
  const b = toStored(
    { x: anchor.x + (width + pad) / frame.width, y: anchor.y + (height + pad) / frame.height },
    text.turns,
  )
  return {
    a: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    b: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) },
  }
}

export interface SourceFontPreview {
  /** PNG of the text drawn exactly as the export draws it (transparent background). */
  url: string
  /** Area the image covers, in stored fractions. */
  area: PageRect
}

/**
 * Draws an edited text with its original font the way the export does
 * (pdf-lib on a page cropped to the text, rendered by pdf.js), because
 * browsers can't use the subset fonts embedded in PDFs directly.
 *
 * @param pixelsPerPoint Rendering resolution.
 * @param turns Display rotation of the page (the image is rendered upright for it).
 */
export async function renderSourceFontPreview(
  text: TextAnnotation,
  source: { sourceId: string; sourceIndex: number },
  size: { width: number; height: number },
  pixelsPerPoint: number,
  turns: number,
): Promise<SourceFontPreview | null> {
  if (!usesSourceFont(text)) return null
  const data = useDocumentStore.getState().sources.get(source.sourceId)?.data
  if (!data) return null
  const lib = await import('pdf-lib')
  let original = parsed.get(data)
  if (!original) {
    original = lib.PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false })
    parsed.set(data, original)
  }
  const output = await lib.PDFDocument.create()
  const font = embedSourceFont(
    lib,
    output,
    await original,
    source.sourceIndex,
    text.sourceFont!,
    text.text,
  )
  if (!font) return null
  const page = output.addPage([size.width, size.height])
  const box = { x: 0, y: 0, width: size.width, height: size.height }
  drawAnnotations(
    lib,
    page,
    [{ ...text, coverOriginal: undefined }],
    box,
    font,
    new Map(),
    font,
    new Map([[sourceFontKey(text.id), font]]),
  )
  const area = textArea(text, size)
  // Only the text's area is rendered
  const x0 = area.a.x * size.width
  const x1 = area.b.x * size.width
  const y0 = (1 - area.b.y) * size.height
  const y1 = (1 - area.a.y) * size.height
  page.setMediaBox(x0, y0, x1 - x0, y1 - y0)

  const pdf = await openPdf(await output.save())
  try {
    const rendered = await pdf.getPage(1)
    const viewport = rendered.getViewport({
      scale: pixelsPerPoint,
      rotation: (((turns % 4) + 4) % 4) * 90,
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    const context = canvas.getContext('2d')
    if (!context) return null
    await rendered.render({ canvas, canvasContext: context, viewport, background: 'rgba(0,0,0,0)' })
      .promise
    return { url: canvas.toDataURL('image/png'), area }
  } finally {
    void closePdf(pdf)
  }
}
