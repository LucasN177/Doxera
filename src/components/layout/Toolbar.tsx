import { FolderOpen, PanelLeft, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { PageNavigation } from '@/features/viewer/PageNavigation'
import { ZoomControls } from '@/features/viewer/ZoomControls'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { formatFileSize } from '@/lib/file'
import { useDocumentStore } from '@/stores/documentStore'
import { useSearchStore } from '@/stores/searchStore'
import { useViewerStore } from '@/stores/viewerStore'
import { IconButton } from './IconButton'

export function Toolbar() {
  const document = useDocumentStore((state) => state.document)
  const close = useDocumentStore((state) => state.close)
  const sidebarOpen = useViewerStore((state) => state.sidebarOpen)
  const toggleSidebar = useViewerStore((state) => state.toggleSidebar)
  const { openFromPicker } = useOpenDocument()
  const openSearch = useSearchStore((state) => state.openSearch)

  return (
    <header className="bg-background flex h-12 shrink-0 items-center gap-1 border-b px-2">
      <IconButton
        label={sidebarOpen ? 'Seitenleiste ausblenden' : 'Seitenleiste einblenden'}
        aria-pressed={sidebarOpen}
        disabled={!document}
        onClick={toggleSidebar}
      >
        <PanelLeft />
      </IconButton>

      <div className="flex items-center gap-2 px-1">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
        <span className="font-semibold tracking-tight max-sm:hidden">Doxera</span>
      </div>

      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />

      <Button variant="ghost" size="sm" onClick={() => void openFromPicker()}>
        <FolderOpen />
        <span className="max-sm:hidden">Öffnen</span>
      </Button>

      {document && (
        <div className="flex min-w-0 items-baseline gap-2 px-2" title={document.name}>
          <span className="truncate text-sm font-medium">{document.name}</span>
          <span className="text-muted-foreground shrink-0 text-xs max-md:hidden">
            {formatFileSize(document.size)}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {document && (
        <>
          <PageNavigation pageCount={document.pageCount} />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
          <ZoomControls />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-6" />
          <IconButton label="Suchen" shortcut="Strg+F" onClick={openSearch}>
            <Search />
          </IconButton>
          <IconButton label="Dokument schließen" onClick={close}>
            <X />
          </IconButton>
        </>
      )}
    </header>
  )
}
