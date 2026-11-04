import type { OcrBlock, OcrBox, OcrPage } from '@/types/ocr'

/** The parts of a Tesseract.js result that are used (blocks output). */
interface TesseractBox {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface TesseractPage {
  blocks:
    | {
        bbox: TesseractBox
        paragraphs: {
          bbox: TesseractBox
          lines: {
            bbox: TesseractBox
            baseline: TesseractBox
            words: { text: string; confidence: number; bbox: TesseractBox }[]
          }[]
        }[]
      }[]
    | null
}

/**
 * Converts a Tesseract.js result (pixels of the recognized image) into page
 * fractions. Empty words, lines and paragraphs are dropped.
 */
export function fromTesseract(page: TesseractPage, width: number, height: number): OcrPage {
  const box = ({ x0, y0, x1, y1 }: TesseractBox): OcrBox => [
    x0 / width,
    y0 / height,
    x1 / width,
    y1 / height,
  ]
  let sum = 0
  let count = 0
  const blocks: OcrBlock[] = (page.blocks ?? []).flatMap((block) => {
    const paragraphs = block.paragraphs.flatMap((paragraph) => {
      const lines = paragraph.lines.flatMap((line) => {
        const words = line.words
          .filter((word) => word.text.trim())
          .map((word) => {
            sum += word.confidence
            count++
            return { text: word.text.trim(), box: box(word.bbox), confidence: word.confidence }
          })
        return words.length > 0
          ? [{ box: box(line.bbox), baseline: box(line.baseline), words }]
          : []
      })
      return lines.length > 0 ? [{ box: box(paragraph.bbox), lines }] : []
    })
    return paragraphs.length > 0 ? [{ box: box(block.bbox), paragraphs }] : []
  })
  return { blocks, confidence: count > 0 ? sum / count : 0 }
}

/** All recognized words of a page, line by line. */
export function ocrLines(page: OcrPage) {
  return page.blocks.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
}

/** Plain text of a page: lines joined by line breaks, paragraphs by blank lines. */
export function ocrText(page: OcrPage): string {
  return page.blocks
    .flatMap((block) =>
      block.paragraphs.map((paragraph) =>
        paragraph.lines.map((line) => line.words.map((word) => word.text).join(' ')).join('\n'),
      ),
    )
    .join('\n\n')
}
