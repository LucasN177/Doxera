import {
  Download,
  FileText,
  FolderOpen,
  Keyboard,
  LayoutGrid,
  MessageSquareText,
  PanelLeft,
  PenLine,
  Redo2,
  Search,
  Share,
  Undo2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/features/settings/ThemeToggle'
import { TextMenu } from '@/features/text/TextMenu'
import { PageNavigation } from '@/features/viewer/PageNavigation'
import { ZoomControls } from '@/features/viewer/ZoomControls'
import { useComments } from '@/hooks/useComments'
import { useExportDocument } from '@/hooks/useExportDocument'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { formatFileSize } from '@/lib/file'
import { formatShortcut } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useDocumentStore } from '@/stores/documentStore'
import { useSearchStore } from '@/stores/searchStore'
import { useUiStore } from '@/stores/uiStore'
import { useViewerStore } from '@/stores/viewerStore'
import { IconButton } from './IconButton'

const separator = 'mx-1 data-[orientation=vertical]:h-6'

export function Toolbar() {
  const document = useDocumentStore((state) => state.document)
  const close = useDocumentStore((state) => state.close)
  const canUndo = useDocumentStore((state) => state.history.past.length > 0)
  const canRedo = useDocumentStore((state) => state.history.future.length > 0)
  const { undo, redo } = useDocumentStore.getState()
  const sidebarOpen = useViewerStore((state) => state.sidebarOpen)
  const toggleSidebar = useViewerStore((state) => state.toggleSidebar)
  const viewMode = useViewerStore((state) => state.viewMode)
  const setViewMode = useViewerStore((state) => state.setViewMode)
  const grid = viewMode === 'grid'
  const annotating = useAnnotationStore((state) => state.active)
  const commentsOpen = useUiStore((state) => state.commentsOpen)
  const commentCount = useComments().length
  const setAnnotating = useAnnotationStore((state) => state.setActive)
  const { openFromPicker } = useOpenDocument()
  const openSearch = useSearchStore((state) => state.openSearch)
  const openShortcuts = useUiStore((state) => state.openShortcuts)
  const { save, share, canShare, savesViaShareSheet } = useExportDocument()

  return (
    <header className="bg-background box-content flex h-12 shrink-0 items-center gap-1 border-b px-2 pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
      <IconButton
        label={sidebarOpen ? 'Seitenleiste ausblenden' : 'Seitenleiste einblenden'}
        aria-pressed={sidebarOpen}
        disabled={!document || grid}
        className="max-sm:hidden"
        onClick={toggleSidebar}
      >
        <PanelLeft />
      </IconButton>

      <div className="flex shrink-0 items-center gap-2 px-1">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
        <span className="font-semibold tracking-tight max-lg:hidden">Doxera</span>
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
        <span className="max-lg:hidden">Öffnen</span>
      </Button>

      {document && (
        <div className="flex min-w-0 items-baseline gap-2 px-2 max-lg:hidden" title={document.name}>
          <span className="truncate text-sm font-medium">{document.name}</span>
          <span className="text-muted-foreground shrink-0 text-xs max-lg:hidden">
            {formatFileSize(document.size)}
          </span>
        </div>
      )}

      {document && (
        // On phones undo/redo only show in the page overview, where pages are edited
        <div className={cn('flex items-center', !grid && 'max-sm:hidden')}>
          <IconButton
            label="Rückgängig"
            shortcut={formatShortcut('mod+Z')}
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label="Wiederholen"
            shortcut={formatShortcut('mod+Y')}
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 />
          </IconButton>
        </div>
      )}

      <div className="flex-1" />

      {document && (
        <>
          <IconButton
            label={grid ? 'Zur Dokumentansicht' : 'Seitenübersicht'}
            shortcut="G"
            aria-pressed={grid}
            className={cn(grid && 'bg-accent text-accent-foreground')}
            onClick={() => setViewMode(grid ? 'document' : 'grid')}
          >
            {grid ? <FileText /> : <LayoutGrid />}
          </IconButton>
          {grid ? (
            <span className="text-muted-foreground px-1 text-sm whitespace-nowrap">
              {document.pages.length === 1 ? '1 Seite' : `${document.pages.length} Seiten`}
            </span>
          ) : (
            <>
              <PageNavigation pageCount={document.pages.length} />
              <Separator orientation="vertical" className={`${separator} max-lg:hidden`} />
              <ZoomControls />
            </>
          )}
          <Separator orientation="vertical" className={separator} />
          {!grid && (
            <>
              <IconButton
                label={annotating ? 'Zeichnen beenden' : 'Zeichnen & beschriften'}
                aria-pressed={annotating}
                className={cn(annotating && 'bg-accent text-accent-foreground')}
                onClick={() => setAnnotating(!annotating)}
              >
                <PenLine />
              </IconButton>
              <IconButton
                label={commentsOpen ? 'Kommentare ausblenden' : `Kommentare (${commentCount})`}
                aria-pressed={commentsOpen}
                className={cn(
                  'relative max-sm:hidden',
                  commentsOpen && 'bg-accent text-accent-foreground',
                )}
                onClick={() => useUiStore.getState().setCommentsOpen(!commentsOpen)}
              >
                <MessageSquareText />
                {commentCount > 0 && (
                  <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 tabular-nums">
                    {commentCount}
                  </span>
                )}
              </IconButton>
              <IconButton label="Suchen" shortcut={formatShortcut('mod+F')} onClick={openSearch}>
                <Search />
              </IconButton>
            </>
          )}
          <TextMenu />
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
        className="max-lg:hidden"
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
