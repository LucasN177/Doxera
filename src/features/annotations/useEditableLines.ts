import { useEffect, useState } from 'react'
import { toEditableLines, type EditableLine } from '@/engine/document/textEditing'
import { useDocumentStore } from '@/stores/documentStore'
import type { ResolvedPage } from '@/types/document'

/** Text lines per source page; sources never change, so results stay valid. */
const cache = new Map<string, Promise<EditableLine[]>>()

function loadLines(page: ResolvedPage): Promise<EditableLine[]> | null {
  const { sourceId, sourceIndex } = page.ref
  const key = `${sourceId}:${sourceIndex}`
  const cached = cache.get(key)
  if (cached) return cached
  const source = useDocumentStore.getState().sources.get(sourceId)
  if (!source) return null
  const rotate = source.pageSizes[sourceIndex]?.rotate ?? 0
  const lines = import('@/engine/mupdf/client')
    .then(({ readTextLines }) => readTextLines(source, sourceIndex))
    .then((raw) => toEditableLines(raw, rotate))
  // A failure (e.g. offline before MuPDF was cached) may be retried later
  lines.catch(() => cache.delete(key))
  cache.set(key, lines)
  return lines
}

export type LinesState =
  { status: 'loading' } | { status: 'ready'; lines: EditableLine[] } | { status: 'error' }

/** Editable text lines of a page, read with MuPDF while `enabled`. */
export function useEditableLines(page: ResolvedPage, enabled: boolean): LinesState | null {
  const key = `${page.ref.sourceId}:${page.ref.sourceIndex}`
  const [state, setState] = useState<{ key: string; value: LinesState } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const lines = loadLines(page)
    if (!lines) return
    lines.then(
      (value) => !cancelled && setState({ key, value: { status: 'ready', lines: value } }),
      (error: unknown) => {
        console.error('Text konnte nicht gelesen werden', error)
        if (!cancelled) setState({ key, value: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
    // The page's source and index determine the lines
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  if (!enabled) return null
  return state?.key === key ? state.value : { status: 'loading' }
}
