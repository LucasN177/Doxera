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
import { LanguageToggle } from '@/features/settings/LanguageToggle'
import { ThemeToggle } from '@/features/settings/ThemeToggle'
import { TextMenu } from '@/features/text/TextMenu'
import { ToolsMenu } from '@/features/convert/ToolsMenu'
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
import { t } from '@/i18n'

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
    <header className="bg-background box-content flex h-12 shrink-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto border-b px-2 pt-[env(safe-area-inset-top)] pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))] max-sm:gap-0.5">
      <IconButton
        label={sidebarOpen ? t('Seitenleiste ausblenden') : t('Seitenleiste einblenden')}
        aria-pressed={sidebarOpen}
        disabled={!document || grid}
        className="max-sm:hidden"
        onClick={toggleSidebar}
      >
        <PanelLeft />
      </IconButton>

      {/* With a document open, phones need the room for tools */}
      <div className={cn('flex shrink-0 items-center gap-2 px-1', document && 'max-sm:hidden')}>
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
        <span className="font-semibold tracking-tight max-lg:hidden">Doxera</span>
      </div>

      <Separator orientation="vertical" className={cn(separator, document && 'max-sm:hidden')} />

      <Button
        variant="ghost"
        size="sm"
        aria-label={t('PDF öffnen')}
        title={t('PDF öffnen ({value0})', { value0: formatShortcut('mod+O') })}
        onClick={() => void openFromPicker()}
      >
        <FolderOpen />
        <span className="max-lg:hidden">{t('Öffnen')}</span>
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
            label={t('Rückgängig')}
            shortcut={formatShortcut('mod+Z')}
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 />
          </IconButton>
          <IconButton
            label={t('Wiederholen')}
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
            label={grid ? t('Zur Dokumentansicht') : t('Seitenübersicht')}
            shortcut="G"
            aria-pressed={grid}
            className={cn(grid && 'bg-accent text-accent-foreground')}
            onClick={() => setViewMode(grid ? 'document' : 'grid')}
          >
            {grid ? <FileText /> : <LayoutGrid />}
          </IconButton>
          {grid ? (
            <span className="text-muted-foreground px-1 text-sm whitespace-nowrap">
              {document.pages.length === 1
                ? t('1 Seite')
                : t('{length} Seiten', { length: document.pages.length })}
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
                label={annotating ? t('Zeichnen beenden') : t('Zeichnen & beschriften')}
                aria-pressed={annotating}
                className={cn(annotating && 'bg-accent text-accent-foreground')}
                onClick={() => setAnnotating(!annotating)}
              >
                <PenLine />
              </IconButton>
              <IconButton
                label={
                  commentsOpen
                    ? t('Kommentare ausblenden')
                    : t('Kommentare ({commentCount})', { commentCount })
                }
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
              <IconButton
                label={t('Suchen')}
                shortcut={formatShortcut('mod+F')}
                onClick={openSearch}
              >
                <Search />
              </IconButton>
            </>
          )}
          <TextMenu />
          <ToolsMenu />
          <IconButton
            label={savesViaShareSheet ? t('Sichern oder teilen') : t('Herunterladen')}
            shortcut={formatShortcut('mod+S')}
            onClick={() => void save()}
          >
            {savesViaShareSheet ? <Share /> : <Download />}
          </IconButton>
          {canShare && (
            <IconButton label={t('Teilen')} className="max-sm:hidden" onClick={() => void share()}>
              <Share />
            </IconButton>
          )}
        </>
      )}

      {/* On phones with a document open the bar has no room left; the start screen has */}
      <LanguageToggle className={cn(document && 'max-sm:hidden')} />
      <ThemeToggle className="max-sm:hidden" />
      <IconButton
        label={t('Tastenkürzel')}
        shortcut="?"
        className="max-lg:hidden"
        onClick={openShortcuts}
      >
        <Keyboard />
      </IconButton>

      {document && (
        <IconButton label={t('Dokument schließen')} onClick={close}>
          <X />
        </IconButton>
      )}
    </header>
  )
}
