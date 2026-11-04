import { useDocumentStore } from '@/stores/documentStore'
import type { PageRef } from '@/types/document'
import type { OcrPage } from '@/types/ocr'
import type { OcrLanguage } from '@/engine/ocr/tesseract'
import { recognizePage } from './recognizePage'

export interface OcrProgress {
  /** 1-based number of the page being worked on, of `total`. */
  current: number
  total: number
  /** Progress of the current page, 0–1. */
  page: number
  phase: 'loading' | 'recognizing' | 'saving'
}

export interface OcrOptions {
  pageIds: readonly string[]
  languages: readonly OcrLanguage[]
  /** Leave pages alone that already have text (e.g. not scanned). */
  skipPagesWithText: boolean
  onProgress: (progress: OcrProgress) => void
  signal: AbortSignal
}

export interface OcrSummary {
  recognized: number
  skipped: number
  /** Pages on which no text was found. */
  empty: number
}

const key = (ref: Pick<PageRef, 'sourceId' | 'sourceIndex'>) => `${ref.sourceId}:${ref.sourceIndex}`

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError')
}

/**
 * Recognizes the text of the given pages and makes it searchable: the pages
 * are rebuilt with an invisible text layer into a new source that they then
 * refer to (one undoable step). Rotation, crop and annotations stay.
 */
export async function runOcr({
  pageIds,
  languages,
  skipPagesWithText,
  onProgress,
  signal,
}: OcrOptions): Promise<OcrSummary> {
  const store = useDocumentStore.getState()
  const document = store.document
  if (!document) return { recognized: 0, skipped: 0, empty: 0 }
  const ids = new Set(pageIds)
  // Each source page once, even if it appears several times in the document
  const targets = new Map<string, PageRef>()
  for (const ref of document.pages) {
    if (ids.has(ref.id) && !targets.has(key(ref))) targets.set(key(ref), ref)
  }

  const { terminateOcr } = await import('@/engine/ocr/tesseract')
  const stop = () => void terminateOcr()
  signal.addEventListener('abort', stop)
  const results: Array<{ ref: PageRef; ocr: OcrPage; rotate: number }> = []
  let skipped = 0
  let empty = 0
  try {
    const list = [...targets.values()]
    for (const [index, ref] of list.entries()) {
      aborted(signal)
      const progress = (phase: OcrProgress['phase'], page = 0) =>
        onProgress({ current: index + 1, total: list.length, page, phase })
      progress(index === 0 ? 'loading' : 'recognizing')
      const source = store.sources.get(ref.sourceId)
      if (!source) continue
      const result = await recognizePage(source.pdf, ref.sourceIndex + 1, languages, {
        skipPagesWithText,
        onProgress: (value) => progress('recognizing', value),
        signal,
      })
      if (result.status === 'skipped') skipped++
      else if (result.status === 'empty') empty++
      else results.push({ ref, ocr: result.ocr, rotate: result.rotate })
    }
    aborted(signal)
  } finally {
    signal.removeEventListener('abort', stop)
  }

  if (results.length > 0) {
    onProgress({ current: results.length, total: results.length, page: 1, phase: 'saving' })
    const { buildOcrPdf } = await import('@/engine/ocr/textLayer')
    const data = await buildOcrPdf(
      results.map(({ ref, ocr, rotate }) => ({
        sourceId: ref.sourceId,
        sourceIndex: ref.sourceIndex,
        rotate,
        ocr,
      })),
      store.sources,
    )
    aborted(signal)
    const source = await useDocumentStore.getState().addSource(`${document.name} (OCR)`, data)
    if (!source) return { recognized: 0, skipped, empty }
    const positions = new Map(results.map(({ ref }, index) => [key(ref), index]))
    useDocumentStore.getState().edit((pages) =>
      pages.map((ref) => {
        const position = positions.get(key(ref))
        return position === undefined ? ref : { ...ref, sourceId: source.id, sourceIndex: position }
      }),
    )
  }
  return { recognized: results.length, skipped, empty }
}
