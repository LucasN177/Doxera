import { useEffect, useState } from 'react'
import { unrotatedSize } from '@/engine/document/annotations'
import {
  toEditableImages,
  toEditableLines,
  toEditableParagraphs,
  type EditableImage,
  type EditableLine,
} from '@/engine/document/contentEditing'
import { useDocumentStore } from '@/stores/documentStore'
import type { PageRef, ResolvedPage } from '@/types/document'

export interface EditableContent {
  /** Single lines (for text export and markings). */
  lines: EditableLine[]
  /** Lines grouped into paragraphs where they form one (edit targets). */
  paragraphs: EditableLine[]
  images: EditableImage[]
}

/** Content per source page; sources never change, so results stay valid. */
const cache = new Map<string, Promise<EditableContent>>()

/** Text lines and images of a source page (read once with MuPDF, then cached). */
export function loadPageContent(
  ref: Pick<PageRef, 'sourceId' | 'sourceIndex'>,
): Promise<EditableContent> | null {
  const { sourceId, sourceIndex } = ref
  const key = `${sourceId}:${sourceIndex}`
  const cached = cache.get(key)
  if (cached) return cached
  const source = useDocumentStore.getState().sources.get(sourceId)
  if (!source) return null
  const size = source.pageSizes[sourceIndex]
  const rotate = size?.rotate ?? 0
  const content = import('@/engine/mupdf/client')
    .then(({ readPageContent }) => readPageContent(source, sourceIndex))
    .then((raw) => {
      const lines = toEditableLines(raw, rotate)
      const stored = size ? unrotatedSize(size, Math.round(rotate / 90)) : null
      return {
        lines,
        paragraphs: stored ? toEditableParagraphs(lines, stored) : lines,
        images: toEditableImages(raw, rotate),
      }
    })
  // A failure (e.g. offline before MuPDF was cached) may be retried later
  content.catch(() => cache.delete(key))
  cache.set(key, content)
  return content
}

export type ContentState =
  { status: 'loading' } | { status: 'ready'; content: EditableContent } | { status: 'error' }

/** Editable text lines and images of a page, read with MuPDF while `enabled`. */
export function useEditableContent(page: ResolvedPage, enabled: boolean): ContentState | null {
  const key = `${page.ref.sourceId}:${page.ref.sourceIndex}`
  const [state, setState] = useState<{ key: string; value: ContentState } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const content = loadPageContent(page.ref)
    if (!content) return
    content.then(
      (value) => !cancelled && setState({ key, value: { status: 'ready', content: value } }),
      (error: unknown) => {
        console.error('Seiteninhalt konnte nicht gelesen werden', error)
        if (!cancelled) setState({ key, value: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
    // The page's source and index determine the content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  if (!enabled) return null
  return state?.key === key ? state.value : { status: 'loading' }
}
