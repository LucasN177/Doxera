import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useElementSize } from '@/hooks/useElementSize'
import { useResolvedPages } from '@/hooks/useResolvedPages'
import {
  computePageLayout,
  findPageIndexAt,
  getVisibleRange,
  type PageLayout,
} from '@/lib/pageLayout'
import { clampZoom, computeFitScale } from '@/lib/zoom'
import { scrollForFocalPoint, type FocalPoint } from '@/lib/zoomFocus'
import { useViewerStore } from '@/stores/viewerStore'
import { PageSurface } from './PageSurface'
import { HeaderFooterPreview } from '@/features/headerFooter/HeaderFooterPreview'
import { resetPinchPreview, usePinchZoom } from './usePinchZoom'
import { t } from '@/i18n'

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

interface PendingFocus {
  /** Layout and scale the focal point refers to (what was on screen). */
  layout: PageLayout
  scale: number
  point: FocalPoint
}

/**
 * Continuous vertical page view. Only pages near the viewport get a canvas;
 * all others are empty placeholders with the correct size.
 */
export function DocumentViewer() {
  const zoomMode = useViewerStore((state) => state.zoomMode)
  const scale = useViewerStore((state) => state.scale)
  const navigation = useViewerStore((state) => state.navigation)
  const applyFitScale = useViewerStore((state) => state.applyFitScale)
  const setCurrentPage = useViewerStore((state) => state.setCurrentPage)

  const scrollRef = useRef<HTMLDivElement>(null)
  const viewport = useElementSize(scrollRef)
  const pages = useResolvedPages()
  const pageSizes = useMemo(() => pages.map((page) => page.size), [pages])

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
  const contentRef = useRef<HTMLDivElement>(null)
  /** Set by pinch and Ctrl+wheel zoom: keep this point in place instead of the top edge. */
  const pendingFocus = useRef<PendingFocus | null>(null)
  const rendered = useRef({ layout, scale })

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
    const focus = pendingFocus.current
    if (element && focus && focus.layout !== layout) {
      // Zoom around the pinch center / cursor
      const { scrollTop, scrollLeft } = scrollForFocalPoint(
        focus.layout,
        layout,
        scale / focus.scale,
        focus.point,
        element.clientWidth,
        PADDING,
      )
      resetPinchPreview(contentRef.current)
      element.scrollTop = scrollTop
      element.scrollLeft = scrollLeft
      pendingFocus.current = null
    } else if (element && prevLayout.current && prevLayout.current !== layout) {
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
    rendered.current = { layout, scale }
    syncWithScroll()
  }, [layout, scale, syncWithScroll, viewport.height])

  /** Applies a zoom while keeping `point` (in the currently rendered layout) in place. */
  const zoomAround = useCallback((nextScale: number, point: FocalPoint) => {
    const element = scrollRef.current
    const current = rendered.current
    const clamped = clampZoom(nextScale)
    // Several wheel events can arrive before React renders; the first focus wins
    pendingFocus.current ??= { layout: current.layout, scale: current.scale, point }

    if (Math.abs(clamped - useViewerStore.getState().scale) < 0.0005) {
      // Scale unchanged (e.g. two-finger pan or at the zoom limit): just pan
      const focus = pendingFocus.current
      pendingFocus.current = null
      resetPinchPreview(contentRef.current)
      if (element && focus.scale === current.scale) {
        const { scrollTop, scrollLeft } = scrollForFocalPoint(
          current.layout,
          current.layout,
          1,
          focus.point,
          element.clientWidth,
          PADDING,
        )
        element.scrollTop = scrollTop
        element.scrollLeft = scrollLeft
      }
      return
    }
    useViewerStore.getState().setZoom(clamped)
  }, [])

  usePinchZoom({
    scrollRef,
    contentRef,
    getScale: () => useViewerStore.getState().scale,
    onCommit: zoomAround,
  })

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
      const content = contentRef.current
      if (!content) return
      // Zoom towards the cursor
      const contentRect = content.getBoundingClientRect()
      const scrollerRect = element.getBoundingClientRect()
      zoomAround(useViewerStore.getState().scale * Math.exp(-event.deltaY * 0.002), {
        contentX: event.clientX - contentRect.left,
        contentY: event.clientY - contentRect.top,
        viewportX: event.clientX - scrollerRect.left,
        viewportY: event.clientY - scrollerRect.top,
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  const pageElements = []
  for (let index = range.first; index <= range.last && index < layout.tops.length; index++) {
    const page = pages[index]
    if (!page) continue
    pageElements.push(
      <div
        key={page.ref.id}
        className="absolute left-1/2 -translate-x-1/2 overflow-hidden bg-white shadow-md ring-1 ring-black/5"
        style={{
          top: layout.tops[index],
          width: layout.widths[index],
          height: layout.heights[index],
        }}
        data-page-number={index + 1}
        role="group"
        aria-label={t('Seite {value0}', { value0: index + 1 })}
      >
        <PageSurface page={page} scale={scale} pageIndex={index} textLayer />
        <HeaderFooterPreview index={index} total={pages.length} size={page.size} scale={scale} />
      </div>,
    )
  }

  return (
    <div
      ref={scrollRef}
      className="absolute inset-0 overflow-auto overscroll-contain"
      // Native one-finger scrolling stays; pinching is handled by usePinchZoom
      style={{ touchAction: 'pan-x pan-y' }}
      onScroll={syncWithScroll}
      tabIndex={0}
      aria-label={t('Dokumentansicht')}
    >
      <div
        ref={contentRef}
        className="relative mx-auto"
        style={{
          height: layout.totalHeight,
          width: layout.maxWidth + 2 * PADDING,
          minWidth: '100%',
        }}
      >
        {pageElements}
      </div>
    </div>
  )
}
