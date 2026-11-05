import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  deletePages,
  duplicatePages,
  movePages,
  rotatePages,
  selectPages,
} from '@/engine/document/pageOps'
import { useExportDocument } from '@/hooks/useExportDocument'
import { pickFiles } from '@/lib/file'
import { useDocumentStore } from '@/stores/documentStore'
import { useViewerStore } from '@/stores/viewerStore'
import { t } from '@/i18n'

/**
 * Page editing actions. They act on the selected pages, or on the page in view
 * when nothing is selected.
 */
export function usePageActions() {
  const { exportSelection } = useExportDocument()

  /** Ids the actions apply to, in document order. */
  const targetIds = useCallback((): string[] => {
    const pages = useDocumentStore.getState().document?.pages ?? []
    const { selectedIds, currentPage } = useViewerStore.getState()
    if (selectedIds.length > 0) {
      const selected = new Set(selectedIds)
      return pages.filter((page) => selected.has(page.id)).map((page) => page.id)
    }
    const current = pages[currentPage - 1]
    return current ? [current.id] : []
  }, [])

  const rotate = useCallback(
    (delta: 90 | -90) => {
      const ids = new Set(targetIds())
      useDocumentStore.getState().edit((pages) => rotatePages(pages, ids, delta))
    },
    [targetIds],
  )

  const duplicate = useCallback(() => {
    const ids = new Set(targetIds())
    useDocumentStore.getState().edit((pages) => duplicatePages(pages, ids))
  }, [targetIds])

  const remove = useCallback(() => {
    const ids = new Set(targetIds())
    if (ids.size === 0) return
    const ok = useDocumentStore.getState().edit((pages) => deletePages(pages, ids))
    if (!ok) {
      toast.error(t('Ein Dokument braucht mindestens eine Seite.'))
      return
    }
    useViewerStore.getState().clearSelection()
    toast(
      ids.size === 1 ? t('Seite gelöscht.') : t('{count} Seiten gelöscht.', { count: ids.size }),
      {
        action: { label: t('Rückgängig'), onClick: () => useDocumentStore.getState().undo() },
      },
    )
  }, [targetIds])

  /** Moves the given pages so they start at `toIndex` (index without the moved pages). */
  const move = useCallback((ids: string[], toIndex: number) => {
    const set = new Set(ids)
    useDocumentStore.getState().edit((pages) => movePages(pages, set, toIndex))
  }, [])

  /** Inserts other PDFs after the last selected page (or the page in view). */
  const insertPdf = useCallback(async () => {
    const files = await pickFiles('application/pdf,.pdf', true)
    if (files.length === 0) return
    const pages = useDocumentStore.getState().document?.pages ?? []
    const ids = targetIds()
    const lastIndex = Math.max(...ids.map((id) => pages.findIndex((page) => page.id === id)), -1)
    const index = lastIndex === -1 ? pages.length : lastIndex + 1

    const result = await useDocumentStore.getState().insertFiles(files, index)
    for (const error of result.errors) toast.error(error)
    if (result.pages > 0) {
      toast.success(
        result.pages === 1
          ? t('1 Seite eingefügt.')
          : t('{count} Seiten eingefügt.', { count: result.pages }),
        {
          action: { label: t('Rückgängig'), onClick: () => useDocumentStore.getState().undo() },
        },
      )
      useViewerStore.getState().goToPage(index + 1)
    }
  }, [targetIds])

  const extract = useCallback(() => {
    const pages = useDocumentStore.getState().document?.pages ?? []
    const selected = selectPages(pages, new Set(targetIds()))
    if (selected.length > 0) void exportSelection(selected)
  }, [targetIds, exportSelection])

  const selectAll = useCallback(() => {
    const pages = useDocumentStore.getState().document?.pages ?? []
    useViewerStore.getState().setSelection(pages.map((page) => page.id))
  }, [])

  return { rotate, duplicate, remove, move, insertPdf, extract, selectAll }
}
