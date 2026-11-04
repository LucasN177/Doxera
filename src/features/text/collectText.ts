import { unrotatedSize } from '@/engine/document/annotations'
import { pageTextLines } from '@/engine/text/pageText'
import { bodyFontSize, structureLines, type TextBlock } from '@/engine/text/structure'
import { loadPageContent } from '@/features/annotations/useEditableContent'
import { useDocumentStore } from '@/stores/documentStore'

/**
 * Reads the text of the given pages (in document order) with MuPDF and
 * structures it into headings, paragraphs and lists, one list per page.
 * Edited text, text boxes, crop and redactions are taken into account.
 */
export async function collectText(
  pageIds: ReadonlySet<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<TextBlock[][]> {
  const { document, sources } = useDocumentStore.getState()
  if (!document) return []
  const refs = document.pages.filter((page) => pageIds.has(page.id))
  const pages = []
  for (const [index, ref] of refs.entries()) {
    const source = sources.get(ref.sourceId)
    const content = await loadPageContent(ref)
    const size = source?.pageSizes[ref.sourceIndex]
    if (content && size) {
      const stored = unrotatedSize(size, Math.round((size.rotate ?? 0) / 90))
      pages.push(pageTextLines(content.lines, ref, stored))
    } else {
      pages.push([])
    }
    onProgress?.(index + 1, refs.length)
  }
  // One body size for the whole document keeps heading levels consistent
  const body = bodyFontSize(pages.flat())
  return pages.map((lines) => structureLines(lines, body))
}
