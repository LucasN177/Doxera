import { Loader2 } from 'lucide-react'
import { ThumbnailSidebar } from '@/features/pages/ThumbnailSidebar'
import { SearchBar } from '@/features/search/SearchBar'
import { useSearchShortcuts } from '@/features/search/useSearchShortcuts'
import { DocumentViewer } from '@/features/viewer/DocumentViewer'
import { EmptyState } from '@/features/viewer/EmptyState'
import { useDocumentStore } from '@/stores/documentStore'
import { useViewerStore } from '@/stores/viewerStore'
import { Toolbar } from './Toolbar'

export function AppLayout() {
  const document = useDocumentStore((state) => state.document)
  const pdf = useDocumentStore((state) => state.pdf)
  const loading = useDocumentStore((state) => state.loading)
  const sidebarOpen = useViewerStore((state) => state.sidebarOpen)
  useSearchShortcuts()

  return (
    <div className="bg-background text-foreground flex h-svh flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        {document && pdf && sidebarOpen && (
          <ThumbnailSidebar key={document.id} document={document} pdf={pdf} />
        )}
        <main className="bg-muted relative min-w-0 flex-1">
          {document && pdf ? (
            <>
              <DocumentViewer key={document.id} document={document} pdf={pdf} />
              <SearchBar />
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
