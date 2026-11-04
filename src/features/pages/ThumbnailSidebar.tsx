import type { PDFDocumentProxy } from 'pdfjs-dist'
import { memo, useEffect, useRef, type RefObject } from 'react'
import { PageCanvas } from '@/features/viewer/PageCanvas'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'
import { useViewerStore } from '@/stores/viewerStore'
import type { OpenDocument, PageSize } from '@/types/document'

const THUMBNAIL_WIDTH = 120

interface ThumbnailSidebarProps {
  document: OpenDocument
  pdf: PDFDocumentProxy
}

export function ThumbnailSidebar({ document, pdf }: ThumbnailSidebarProps) {
  const currentPage = useViewerStore((state) => state.currentPage)
  const goToPage = useViewerStore((state) => state.goToPage)
  const scrollRef = useRef<HTMLElement>(null)

  return (
    <aside
      ref={scrollRef}
      className="bg-muted/40 w-44 shrink-0 overflow-y-auto border-r max-sm:hidden"
      aria-label="Seitenübersicht"
    >
      <ol className="flex flex-col items-center gap-4 px-3 py-4">
        {document.pageSizes.map((size, index) => (
          <Thumbnail
            key={index}
            pdf={pdf}
            pageNumber={index + 1}
            size={size}
            active={currentPage === index + 1}
            onSelect={goToPage}
            scrollRoot={scrollRef}
          />
        ))}
      </ol>
    </aside>
  )
}

interface ThumbnailProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  size: PageSize
  active: boolean
  onSelect: (page: number) => void
  scrollRoot: RefObject<HTMLElement | null>
}

const Thumbnail = memo(function Thumbnail({
  pdf,
  pageNumber,
  size,
  active,
  onSelect,
  scrollRoot,
}: ThumbnailProps) {
  const itemRef = useRef<HTMLLIElement>(null)
  const inView = useInView(itemRef, { root: scrollRoot, rootMargin: '300px 0px' })
  const scale = THUMBNAIL_WIDTH / size.width

  // Keep the active page visible in the sidebar while scrolling the document
  useEffect(() => {
    if (active) itemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <li ref={itemRef}>
      <button
        type="button"
        className="group flex flex-col items-center gap-1.5 rounded-md outline-none"
        onClick={() => onSelect(pageNumber)}
        aria-label={`Gehe zu Seite ${pageNumber}`}
        aria-current={active ? 'page' : undefined}
      >
        <div
          className={cn(
            'group-hover:ring-primary/40 group-focus-visible:ring-ring relative bg-white shadow-sm ring-1 ring-black/10 transition-shadow group-hover:ring-2 group-focus-visible:ring-2',
            active && 'ring-primary group-hover:ring-primary ring-2',
          )}
          style={{ width: THUMBNAIL_WIDTH, height: Math.round(size.height * scale) }}
        >
          {inView && <PageCanvas pdf={pdf} pageNumber={pageNumber} scale={scale} />}
        </div>
        <span
          className={cn(
            'text-muted-foreground rounded px-1.5 text-xs tabular-nums',
            active && 'bg-primary text-primary-foreground',
          )}
        >
          {pageNumber}
        </span>
      </button>
    </li>
  )
})
