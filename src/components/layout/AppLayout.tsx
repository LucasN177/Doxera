import { Loader2 } from 'lucide-react'
import { AnnotationBar } from '@/features/annotations/AnnotationBar'
import { CropDialog } from '@/features/pages/CropDialog'
import { PageOverview } from '@/features/pages/PageOverview'
import { SplitDialog } from '@/features/pages/SplitDialog'
import { ThumbnailSidebar } from '@/features/pages/ThumbnailSidebar'
import { SearchBar } from '@/features/search/SearchBar'
import { useSearchShortcuts } from '@/features/search/useSearchShortcuts'
import { DocumentViewer } from '@/features/viewer/DocumentViewer'
import { EmptyState } from '@/features/viewer/EmptyState'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useViewerStore } from '@/stores/viewerStore'
import { Toolbar } from './Toolbar'

export function AppLayout() {
  const document = useDocumentStore((state) => state.document)
  const pdf = useDocumentStore((state) => state.pdf)
  const loading = useDocumentStore((state) => state.loading)
  const sidebarOpen = useViewerStore((state) => state.sidebarOpen)
  const viewMode = useViewerStore((state) => state.viewMode)
  const annotating = useAnnotationStore((state) => state.active)
  useSearchShortcuts()

  return (
    <div className="bg-background text-foreground flex h-svh flex-col">
      <Toolbar />
      {document && annotating && viewMode === 'document' && <AnnotationBar />}
      <div className="flex min-h-0 flex-1">
        {document && pdf && sidebarOpen && viewMode === 'document' && (
          <ThumbnailSidebar key={document.id} />
        )}
        <main className="bg-muted relative min-w-0 flex-1">
          {document && pdf ? (
            <>
              {viewMode === 'grid' ? (
                <PageOverview key={document.id} />
              ) : (
                <>
                  <DocumentViewer key={document.id} />
                  <SearchBar />
                </>
              )}
              <SplitDialog />
              <CropDialog />
            </>
          ) : (
            <EmptyState />
          )}
          {loading && (
            <div
              role="status"
              className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]"
            >
              <div className="bg-background flex items-center gap-2 rounded-md border px-4 py-2 text-sm shadow-sm">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                PDF wird geöffnet …
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
