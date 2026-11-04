import { useMemo } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import type { NoteAnnotation } from '@/types/annotations'

export interface CommentEntry {
  note: NoteAnnotation
  pageId: string
  pageNumber: number
}

/** All notes of the document in page order. */
export function useComments(): CommentEntry[] {
  const pages = useDocumentStore((state) => state.document?.pages)
  return useMemo(
    () =>
      (pages ?? []).flatMap((page, index) =>
        (page.annotations ?? [])
          .filter((annotation): annotation is NoteAnnotation => annotation.type === 'note')
          .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x)
          .map((note) => ({ note, pageId: page.id, pageNumber: index + 1 })),
      ),
    [pages],
  )
}
