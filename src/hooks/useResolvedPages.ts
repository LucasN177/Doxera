import { useMemo } from 'react'
import { resolvePages } from '@/engine/document/pageOps'
import { useDocumentStore } from '@/stores/documentStore'
import type { ResolvedPage } from '@/types/document'

/** The document's pages with their source PDF and displayed size. */
export function useResolvedPages(): ResolvedPage[] {
  const pages = useDocumentStore((state) => state.document?.pages)
  const sources = useDocumentStore((state) => state.sources)
  return useMemo(() => (pages ? resolvePages(pages, sources) : []), [pages, sources])
}
