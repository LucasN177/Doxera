import type { PDFDocumentProxy } from 'pdfjs-dist'
import { getTextRuns } from '@/engine/render/pdfjs'
import { buildPageText, type PageText } from './textSearch'

const indexCache = new WeakMap<PDFDocumentProxy, Promise<PageText[]>>()

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
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        pages.push(buildPageText(await getTextRuns(pdf, pageNumber)))
        onProgress?.(pageNumber)
      }
      return pages
    })()
    // Allow a retry if extraction fails (e.g. document destroyed mid-way)
    index.catch(() => indexCache.delete(pdf))
    indexCache.set(pdf, index)
  }
  return index
}
