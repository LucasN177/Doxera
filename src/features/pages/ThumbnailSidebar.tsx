import { useViewerStore } from '@/stores/viewerStore'
import { PageActionBar } from './PageActionBar'
import { SortablePages } from './SortablePages'
import { usePageActions } from './usePageActions'
import { t } from '@/i18n'

const THUMBNAIL_WIDTH = 120

/** Sidebar with page thumbnails: navigate, select, reorder (drag & drop) and edit pages. */
export function ThumbnailSidebar() {
  const selectedCount = useViewerStore((state) => state.selectedIds.length)
  const actions = usePageActions()

  return (
    <aside
      className="bg-muted/40 flex w-52 shrink-0 flex-col border-r max-sm:hidden"
      aria-label={t('Seitenleiste')}
    >
      <PageActionBar actions={actions} selectedCount={selectedCount} />
      <SortablePages
        layout="list"
        thumbnailWidth={THUMBNAIL_WIDTH}
        actions={actions}
        className="flex-1"
        label={t('Seiten')}
      />
    </aside>
  )
}
