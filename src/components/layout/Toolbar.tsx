import { Download, FolderOpen, Keyboard, PanelLeft, Search, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/features/settings/ThemeToggle'
import { PageNavigation } from '@/features/viewer/PageNavigation'
import { ZoomControls } from '@/features/viewer/ZoomControls'
import { useExportDocument } from '@/hooks/useExportDocument'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { formatFileSize } from '@/lib/file'
import { formatShortcut } from '@/lib/platform'
import { useDocumentStore } from '@/stores/documentStore'
import { useSearchStore } from '@/stores/searchStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { IconButton } from './IconButton'

const separator = 'mx-1 data-[orientation=vertical]:h-6'

export function Toolbar() {
  const document = useDocumentStore((state) => state.document)
  const close = useDocumentStore((state) => state.close)
  const sidebarOpen = useViewerStore((state) => state.sidebarOpen)
  const toggleSidebar = useViewerStore((state) => state.toggleSidebar)
  const { openFromPicker } = useOpenDocument()
  const openSearch = useSearchStore((state) => state.openSearch)
  const openShortcuts = useUiStore((state) => state.openShortcuts)
  const { save, share, canShare, savesViaShareSheet } = useExportDocument()

  return (
    <header className="bg-background box-content flex h-12 shrink-0 items-center gap-1 border-b px-2 pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
      <IconButton
        label={sidebarOpen ? 'Seitenleiste ausblenden' : 'Seitenleiste einblenden'}
        aria-pressed={sidebarOpen}
        disabled={!document}
        className="max-sm:hidden"
        onClick={toggleSidebar}
      >
        <PanelLeft />
      </IconButton>

      <div className="flex shrink-0 items-center gap-2 px-1">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
        <span className="font-semibold tracking-tight max-md:hidden">Doxera</span>
      </div>

      <Separator orientation="vertical" className={separator} />

      <Button
        variant="ghost"
        size="sm"
        aria-label="PDF öffnen"
        title={`PDF öffnen (${formatShortcut('mod+O')})`}
        onClick={() => void openFromPicker()}
      >
        <FolderOpen />
        <span className="max-sm:hidden">Öffnen</span>
      </Button>

      {document && (
        <div className="flex min-w-0 items-baseline gap-2 px-2 max-sm:hidden" title={document.name}>
          <span className="truncate text-sm font-medium">{document.name}</span>
          <span className="text-muted-foreground shrink-0 text-xs max-lg:hidden">
            {formatFileSize(document.size)}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {document && (
        <>
          <PageNavigation pageCount={document.pageCount} />
          <Separator orientation="vertical" className={`${separator} max-md:hidden`} />
          <ZoomControls />
          <Separator orientation="vertical" className={separator} />
          <IconButton label="Suchen" shortcut={formatShortcut('mod+F')} onClick={openSearch}>
            <Search />
          </IconButton>
          <IconButton
            label={savesViaShareSheet ? 'Sichern oder teilen' : 'Herunterladen'}
            shortcut={formatShortcut('mod+S')}
            onClick={() => void save()}
          >
            {savesViaShareSheet ? <Share /> : <Download />}
          </IconButton>
          {canShare && (
            <IconButton label="Teilen" className="max-sm:hidden" onClick={() => void share()}>
              <Share />
            </IconButton>
          )}
        </>
      )}

      <ThemeToggle className="max-sm:hidden" />
      <IconButton
        label="Tastenkürzel"
        shortcut="?"
        className="max-md:hidden"
        onClick={openShortcuts}
      >
        <Keyboard />
      </IconButton>

      {document && (
        <IconButton label="Dokument schließen" onClick={close}>
          <X />
        </IconButton>
      )}
    </header>
  )
}
