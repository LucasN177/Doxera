import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useElementSize } from '@/hooks/useElementSize'
import {
  computePageLayout,
  findPageIndexAt,
  getVisibleRange,
  type PageLayout,
} from '@/lib/pageLayout'
import { computeFitScale } from '@/lib/zoom'
import { useViewerStore } from '@/stores/viewerStore'
import type { OpenDocument } from '@/types/document'
import { PageCanvas } from './PageCanvas'
import { TextLayerView } from './TextLayerView'

const PADDING = 24
const GAP = 16

interface Anchor {
  /** Zero-based index of the page at the top of the viewport. */
  index: number
  /** Scroll offset relative to that page's height, so it survives zoom changes. */
  fraction: number
}

function getAnchor(layout: PageLayout, scrollTop: number): Anchor {
  const index = Math.max(0, findPageIndexAt(layout, scrollTop))
  return {
    index,
    fraction: (scrollTop - (layout.tops[index] ?? 0)) / Math.max(1, layout.heights[index] ?? 1),
  }
}

interface DocumentViewerProps {
  document: OpenDocument
  pdf: PDFDocumentProxy
}

/**
 * Continuous vertical page view. Only pages near the viewport get a canvas;
 * all others are empty placeholders with the correct size.
 */
export function DocumentViewer({ document, pdf }: DocumentViewerProps) {
  const zoomMode = useViewerStore((state) => state.zoomMode)
  const scale = useViewerStore((state) => state.scale)
  const navigation = useViewerStore((state) => state.navigation)
  const applyFitScale = useViewerStore((state) => state.applyFitScale)
  const setCurrentPage = useViewerStore((state) => state.setCurrentPage)

  const scrollRef = useRef<HTMLDivElement>(null)
  const viewport = useElementSize(scrollRef)
  const { pageSizes } = document

  // Fit modes: derive the scale from the available space. `scale` is a dependency
  // so the fit is re-applied if something else (e.g. a viewer reset) changes it.
  useLayoutEffect(() => {
    if (zoomMode === 'custom' || viewport.width === 0) return
    applyFitScale(computeFitScale(zoomMode, pageSizes, viewport, PADDING))
  }, [zoomMode, pageSizes, viewport, scale, applyFitScale])

  const layout = useMemo(
    () => computePageLayout(pageSizes, scale, GAP, PADDING),
    [pageSizes, scale],
  )
  const [range, setRange] = useState({ first: 0, last: 0 })
  const anchor = useRef<Anchor>({ index: 0, fraction: 0 })
  const prevLayout = useRef<PageLayout | null>(null)

  const syncWithScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const { scrollTop, clientHeight, scrollHeight } = element

    // Render one extra screen above and below for smooth scrolling
    const next = getVisibleRange(layout, scrollTop - clientHeight, scrollTop + 2 * clientHeight)
    setRange((prev) => (prev.first === next.first && prev.last === next.last ? prev : next))

    anchor.current = getAnchor(layout, scrollTop)

    const atBottom = scrollTop + clientHeight >= scrollHeight - 2
    const current = atBottom
      ? layout.tops.length - 1
      : findPageIndexAt(layout, scrollTop + clientHeight / 3)
    setCurrentPage(current + 1)
  }, [layout, setCurrentPage])

  // Keep the same document position in view when the zoom changes
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element && prevLayout.current && prevLayout.current !== layout) {
      const maxScrollTop = element.scrollHeight - element.clientHeight
      // Unless the browser had to clamp scrollTop (content shrank), read the anchor
      // from the live position: scroll events are async and may not have run yet.
      const { index, fraction } =
        element.scrollTop < maxScrollTop - 1
          ? getAnchor(prevLayout.current, element.scrollTop)
          : anchor.current
      if (index < layout.tops.length) {
        element.scrollTop = layout.tops[index] + fraction * layout.heights[index]
      }
    }
    prevLayout.current = layout
    syncWithScroll()
  }, [layout, syncWithScroll, viewport.height])

  // Explicit navigation (toolbar, thumbnails)
  const handledNavigation = useRef<number | null>(null)
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !navigation || handledNavigation.current === navigation.id) return
    handledNavigation.current = navigation.id
    const index = Math.min(layout.tops.length - 1, Math.max(0, navigation.page - 1))
    if (navigation.onlyIfHidden) {
      const top = layout.tops[index]
      const bottom = top + layout.heights[index]
      const visible = bottom > element.scrollTop && top < element.scrollTop + element.clientHeight
      if (visible) return
    }
    element.scrollTo({ top: layout.tops[index] - PADDING / 2 })
  }, [navigation, layout])

  // Ctrl/Cmd + mouse wheel (and trackpad pinch) zooms the document instead of the page
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const { scale: current, setZoom } = useViewerStore.getState()
      setZoom(current * Math.exp(-event.deltaY * 0.002))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const pages = []
  for (let index = range.first; index <= range.last && index < layout.tops.length; index++) {
    pages.push(
      <div
        key={index}
        className="pdf-page absolute left-1/2 -translate-x-1/2 bg-white shadow-md ring-1 ring-black/5"
        style={
          {
            top: layout.tops[index],
            width: layout.widths[index],
            height: layout.heights[index],
            '--scale-factor': scale,
          } as CSSProperties
        }
        data-page-number={index + 1}
        role="group"
        aria-label={`Seite ${index + 1}`}
      >
        <PageCanvas pdf={pdf} pageNumber={index + 1} scale={scale} />
        <TextLayerView pdf={pdf} pageNumber={index + 1} scale={scale} />
      </div>,
    )
  }

  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 overflow-auto"
      onScroll={syncWithScroll}
      tabIndex={0}
      aria-label="Dokumentansicht"
    >
      <div
        className="relative mx-auto"
        style={{
          height: layout.totalHeight,
          width: layout.maxWidth + 2 * PADDING,
          minWidth: '100%',
        }}
      >
        {pages}
      </div>
    </div>
  )
}
