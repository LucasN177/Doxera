import type { DocumentData, ExportHighlight } from '@/engine/export/dataExport'
import { markedText } from '@/engine/text/marked'
import { loadPageContent } from '@/features/annotations/useEditableContent'
import { collectText } from '@/features/text/collectText'
import { useDocumentStore } from '@/stores/documentStore'
import type { MarkupAnnotation, NoteAnnotation } from '@/types/annotations'

/** Structured text, tables, comments and marked text of the given pages, for export. */
export async function collectData(
  pageIds: ReadonlySet<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<DocumentData> {
  const document = useDocumentStore.getState().document
  if (!document) return { name: '', pageCount: 0, pages: [], comments: [], highlights: [] }
  const numbers = document.pages.flatMap((page, index) => (pageIds.has(page.id) ? [index + 1] : []))
  const blocks = await collectText(pageIds, onProgress)
  const comments = document.pages.flatMap((page, index) =>
    pageIds.has(page.id)
      ? (page.annotations ?? [])
          .filter((item): item is NoteAnnotation => item.type === 'note' && !!item.text.trim())
          .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
          .map((note) => ({
            page: index + 1,
            text: note.text,
            color: note.color,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          }))
      : [],
  )
  const highlights: ExportHighlight[] = []
  for (const [index, page] of document.pages.entries()) {
    if (!pageIds.has(page.id)) continue
    const marks = (page.annotations ?? [])
      .filter((item): item is MarkupAnnotation => MARKUPS.has(item.type))
      .sort((a, b) => top(a) - top(b))
    if (marks.length === 0) continue
    const lines = (await loadPageContent(page))?.lines ?? []
    for (const mark of marks) {
      const text = markedText(lines, mark.rects)
      if (text) highlights.push({ page: index + 1, type: mark.type, text, color: mark.color })
    }
  }
  return {
    name: document.name,
    pageCount: document.pages.length,
    pages: blocks.map((pageBlocks, index) => ({ number: numbers[index], blocks: pageBlocks })),
    comments,
    highlights,
  }
}

const MARKUPS = new Set(['highlight', 'underline', 'strikeout'])
const top = (mark: MarkupAnnotation) =>
  Math.min(...mark.rects.map((rect) => Math.min(rect.a.y, rect.b.y)))
