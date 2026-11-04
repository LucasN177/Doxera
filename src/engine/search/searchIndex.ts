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

const EMPTY_PAGE: PageText = { raw: '', runStarts: [], runLengths: [] }

/**
 * Page texts in document order for an edited page list, which can contain
 * pages of several sources, reordered or duplicated. `onProgress` reports the
 * extracted pages against the total number of pages of all used sources.
 */
export async function loadDocumentTexts(
  pages: ReadonlyArray<{ sourceId: string; sourceIndex: number }>,
  sources: ReadonlyMap<string, { pdf: PDFDocumentProxy }>,
  onProgress?: (done: number, total: number) => void,
): Promise<PageText[]> {
  const used = [...new Set(pages.map((page) => page.sourceId))].flatMap((id) => {
    const source = sources.get(id)
    return source ? [{ id, pdf: source.pdf }] : []
  })
  const total = used.reduce((sum, source) => sum + source.pdf.numPages, 0)

  const texts = new Map<string, PageText[]>()
  let offset = 0
  for (const { id, pdf } of used) {
    texts.set(id, await loadPageTexts(pdf, (done) => onProgress?.(offset + done, total)))
    offset += pdf.numPages
  }
  return pages.map((page) => texts.get(page.sourceId)?.[page.sourceIndex] ?? EMPTY_PAGE)
}
