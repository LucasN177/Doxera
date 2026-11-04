import type { DocumentData } from '@/engine/export/dataExport'
import { collectText } from '@/features/text/collectText'
import { useDocumentStore } from '@/stores/documentStore'
import type { NoteAnnotation } from '@/types/annotations'

/** Structured text, tables and comments of the given pages, for export. */
export async function collectData(
  pageIds: ReadonlySet<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<DocumentData> {
  const document = useDocumentStore.getState().document
  if (!document) return { name: '', pageCount: 0, pages: [], comments: [] }
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
  return {
    name: document.name,
    pageCount: document.pages.length,
    pages: blocks.map((pageBlocks, index) => ({ number: numbers[index], blocks: pageBlocks })),
    comments,
  }
}
