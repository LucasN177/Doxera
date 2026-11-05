import { Eye, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useDocumentStore } from '@/stores/documentStore'
import { GRID_SIZE_MAX, GRID_SIZE_MIN, useViewerStore } from '@/stores/viewerStore'
import { PageActionBar } from './PageActionBar'
import { SortablePages } from './SortablePages'
import { usePageActions } from './usePageActions'
import { t } from '@/i18n'

/**
 * Full-screen grid of all pages for organizing them – the page tools for
 * smartphones (where the sidebar is hidden) and large documents.
 */
export function PageOverview() {
  const actions = usePageActions()
  const selectedCount = useViewerStore((state) => state.selectedIds.length)
  const gridSize = useViewerStore((state) => state.gridSize)
  const setGridSize = useViewerStore((state) => state.setGridSize)

  const open = useCallback((index: number) => {
    const { setCurrentPage, setViewMode } = useViewerStore.getState()
    setCurrentPage(index + 1)
    setViewMode('document')
  }, [])

  /** Opens the (first) selected page, or the page last viewed. */
  const openSelected = () => {
    const { selectedIds, currentPage } = useViewerStore.getState()
    const pages = useDocumentStore.getState().document?.pages ?? []
    const selectedIndex = pages.findIndex((page) => page.id === selectedIds[0])
    open(selectedIndex >= 0 ? selectedIndex : currentPage - 1)
  }

  return (
    <div className="bg-muted absolute inset-0 flex flex-col">
      <div className="bg-background flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5 pl-[max(0.5rem,env(safe-area-inset-left))]">
        <PageActionBar actions={actions} selectedCount={selectedCount} variant="toolbar" />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={openSelected}>
            <Eye />
            {t('Seite anzeigen')}
          </Button>
          <div className="flex items-center gap-1 max-sm:hidden">
            <ZoomOut className="text-muted-foreground size-4" aria-hidden />
            <input
              type="range"
              aria-label={t('Vorschaugröße')}
              className="accent-primary w-28"
              min={GRID_SIZE_MIN}
              max={GRID_SIZE_MAX}
              step={10}
              value={gridSize}
              onChange={(event) => setGridSize(Number(event.target.value))}
            />
            <ZoomIn className="text-muted-foreground size-4" aria-hidden />
          </div>
        </div>
      </div>
      <SortablePages
        layout="grid"
        thumbnailWidth={gridSize}
        actions={actions}
        onOpen={open}
        className="flex-1 pb-[env(safe-area-inset-bottom)]"
        label={t('Seitenübersicht')}
      />
    </div>
  )
}
