import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getTextRuns } from '@/engine/render/pdfjs'
import { buildPageText, type PageText } from './textSearch'

const indexCache = new WeakMap<PDFDocumentProxy, Promise<PageText[]>>()

/** Pages extracted concurrently; keeps the worker busy without flooding it. */
const BATCH_SIZE = 32

/**
 * Extracts the text of all pages once per document. `onProgress` receives the
 * number of pages processed so far (only reported for the first, building call).
 */
export function loadPageTexts(
  pdf: PDFDocumentProxy,
  onProgress?: (pagesDone: number) => void,
): Promise<PageText[]> {
  let index = indexCache.get(pdf)
  if (!index) {
    index = (async () => {
      const pages: PageText[] = []
      // Several pages per round trip to the pdf.js worker; much faster than one by one
      for (let first = 1; first <= pdf.numPages; first += BATCH_SIZE) {
        const last = Math.min(pdf.numPages, first + BATCH_SIZE - 1)
        const batch = await Promise.all(
          Array.from({ length: last - first + 1 }, (_, i) => getTextRuns(pdf, first + i)),
        )
        for (const runs of batch) pages.push(buildPageText(runs))
        onProgress?.(last)
      }
      return pages
    })()
    // Allow a retry if extraction fails (e.g. document destroyed mid-way)
    index.catch(() => indexCache.delete(pdf))
    indexCache.set(pdf, index)
  }
  return index
}
