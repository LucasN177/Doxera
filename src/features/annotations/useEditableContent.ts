import { useEffect, useState } from 'react'
import {
  toEditableImages,
  toEditableLines,
  type EditableImage,
  type EditableLine,
} from '@/engine/document/contentEditing'
import { useDocumentStore } from '@/stores/documentStore'
import type { ResolvedPage } from '@/types/document'

export interface EditableContent {
  lines: EditableLine[]
  images: EditableImage[]
}

/** Content per source page; sources never change, so results stay valid. */
const cache = new Map<string, Promise<EditableContent>>()

function loadContent(page: ResolvedPage): Promise<EditableContent> | null {
  const { sourceId, sourceIndex } = page.ref
  const key = `${sourceId}:${sourceIndex}`
  const cached = cache.get(key)
  if (cached) return cached
  const source = useDocumentStore.getState().sources.get(sourceId)
  if (!source) return null
  const rotate = source.pageSizes[sourceIndex]?.rotate ?? 0
  const content = import('@/engine/mupdf/client')
    .then(({ readPageContent }) => readPageContent(source, sourceIndex))
    .then((raw) => ({
      lines: toEditableLines(raw, rotate),
      images: toEditableImages(raw, rotate),
    }))
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
    const content = loadContent(page)
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
