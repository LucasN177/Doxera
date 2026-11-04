import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OcrLanguage } from '@/engine/ocr/tesseract'
import { getTextContent } from '@/engine/render/pdfjs'
import type { OcrPage } from '@/types/ocr'

/** Mean word confidence (0–100) below which a page counts as having no text. */
const MIN_PAGE_CONFIDENCE = 50

export type PageRecognition =
  | { status: 'recognized'; ocr: OcrPage; rotate: number }
  | { status: 'skipped' }
  | { status: 'empty' }

/**
 * Recognizes the text of one page of an opened PDF (1-based number). Pages
 * that already have text can be skipped.
 */
export async function recognizePage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  languages: readonly OcrLanguage[],
  {
    skipPagesWithText,
    onProgress,
    signal,
  }: {
    skipPagesWithText: boolean
    onProgress?: (progress: number) => void
    signal: AbortSignal
  },
): Promise<PageRecognition> {
  const { recognize, renderForOcr } = await import('@/engine/ocr/tesseract')
  if (skipPagesWithText) {
    const content = await getTextContent(pdf, pageNumber)
    if (content.items.some((item) => 'str' in item && item.str.trim())) return { status: 'skipped' }
  }
  const page = await pdf.getPage(pageNumber)
  const canvas = await renderForOcr(page)
  if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError')
  try {
    const ocr = await recognize(canvas, languages, onProgress)
    // Photos and graphics produce a few unsure "words": that's no text
    return ocr.blocks.length > 0 && ocr.confidence >= MIN_PAGE_CONFIDENCE
      ? { status: 'recognized', ocr, rotate: page.rotate }
      : { status: 'empty' }
  } finally {
    canvas.width = 0 // free the memory right away (iOS keeps canvases around)
  }
}
