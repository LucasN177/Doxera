import type { PDFFont, PDFPage } from 'pdf-lib'
import { toStored } from '@/engine/document/annotations'
import { encodable, toPdf } from '@/engine/document/drawAnnotations'
import type { OcrPage } from '@/types/ocr'
import { ocrLines } from './result'

type PdfLib = typeof import('pdf-lib')

/** Font size relative to the recognized line height (ascenders to descenders). */
const SIZE_PER_LINE_HEIGHT = 0.9

/**
 * Adds recognized text as an invisible text layer (render mode 3) on top of
 * the page, as OCR tools do: each word sits on its line's baseline and is
 * stretched horizontally to the width of the word in the scan, so selecting,
 * searching and copying work where the text is seen.
 *
 * @param turns The page's own rotation in quarter turns (the scan was
 *   recognized as displayed, i.e. with this rotation applied).
 */
export function addOcrText(lib: PdfLib, page: PDFPage, ocr: OcrPage, font: PDFFont, turns: number) {
  const {
    beginText,
    endText,
    popGraphicsState,
    pushGraphicsState,
    setCharacterSqueeze,
    setFontAndSize,
    setTextMatrix,
    setTextRenderingMode,
    showText,
    TextRenderingMode,
  } = lib
  const box = page.getCropBox()
  const quarter = ((turns % 4) + 4) % 4
  // Size of the page as displayed (the scan's frame), in points
  const width = quarter % 2 === 0 ? box.width : box.height
  const height = quarter % 2 === 0 ? box.height : box.width
  const angle = (quarter * 90 * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const fontKey = page.node.newFontDictionary(font.name, font.ref)

  const operators = [
    pushGraphicsState(),
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
  ]
  for (const line of ocrLines(ocr)) {
    const lineHeight = (line.box[3] - line.box[1]) * height
    const size = Math.max(1, lineHeight * SIZE_PER_LINE_HEIGHT)
    const [bx0, by0, bx1, by1] = line.baseline
    const slope = bx1 !== bx0 ? (by1 - by0) / (bx1 - bx0) : 0
    for (const [index, word] of line.words.entries()) {
      const text = encodable(font, word.text)
      const [x0, , x1] = word.box
      // Baseline height at the start of the word
      const y = by0 + slope * (x0 - bx0)
      const start = toPdf(toStored({ x: x0, y }, quarter), box)
      const natural = font.widthOfTextAtSize(text, size)
      const stretch = natural > 0 ? ((x1 - x0) * width * 100) / natural : 100
      operators.push(
        setFontAndSize(fontKey, size),
        setCharacterSqueeze(stretch),
        setTextMatrix(cos, sin, -sin, cos, start.x, start.y),
        // A space after each word but the last keeps words apart when the text is extracted
        showText(font.encodeText(index < line.words.length - 1 ? `${text} ` : text)),
      )
    }
  }
  operators.push(endText(), popGraphicsState())
  page.pushOperators(...operators)
}

/** What the OCR PDF builder needs from a source: its bytes and the pages' own rotation. */
export interface OcrSource {
  data: Uint8Array
}

export interface OcrTarget {
  sourceId: string
  sourceIndex: number
  /** The page's own rotation in degrees (/Rotate). */
  rotate: number
  ocr: OcrPage
}

/**
 * Builds a PDF with the target pages (in the given order), each copied from
 * its source with the recognized text added as invisible text layer.
 */
export async function buildOcrPdf(
  targets: readonly OcrTarget[],
  sources: ReadonlyMap<string, OcrSource>,
): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const { PDFDocument, StandardFonts } = lib
  const output = await PDFDocument.create()
  const font = await output.embedFont(StandardFonts.Helvetica)
  const loaded = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>()
  for (const target of targets) {
    let source = loaded.get(target.sourceId)
    if (!source) {
      const data = sources.get(target.sourceId)?.data
      if (!data) throw new Error(`Quelle ${target.sourceId} fehlt.`)
      source = await PDFDocument.load(data, { ignoreEncryption: true })
      loaded.set(target.sourceId, source)
    }
    const [page] = await output.copyPages(source, [target.sourceIndex])
    addOcrText(lib, page, target.ocr, font, Math.round(target.rotate / 90))
    output.addPage(page)
  }
  output.setProducer('Doxera')
  return output.save()
}
