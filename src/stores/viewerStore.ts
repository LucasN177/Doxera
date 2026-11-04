import { create } from 'zustand'
import { clampZoom, stepZoom, type ZoomMode } from '@/lib/zoom'
import { useDocumentStore } from './documentStore'

interface NavigationRequest {
  /** 1-based page number. */
  page: number
  /** Unique per request, so navigating to the same page twice still scrolls. */
  id: number
  /** Only scroll if the page is not visible at all (used when revealing search results). */
  onlyIfHidden: boolean
}

export interface GoToPageOptions {
  onlyIfHidden?: boolean
}

interface ViewerState {
  zoomMode: ZoomMode
  /** Scale actually used for rendering (derived from the zoom mode for fit modes). */
  scale: number
  /** 1-based number of the page currently in view. */
  currentPage: number
  navigation: NavigationRequest | null
  sidebarOpen: boolean
  /** Ids of the selected pages (PageRef ids), in selection order. */
  selectedIds: string[]
  /** Page from which Shift+click extends the selection. */
  selectionAnchor: string | null

  setZoom: (scale: number) => void
  setZoomMode: (mode: Exclude<ZoomMode, 'custom'>) => void
  zoomIn: () => void
  zoomOut: () => void
  /** Called by the viewer when a fit mode resolves to a concrete scale. */
  applyFitScale: (scale: number) => void
  goToPage: (page: number, options?: GoToPageOptions) => void
  /** Called by the viewer while scrolling; does not trigger navigation. */
  setCurrentPage: (page: number) => void
  toggleSidebar: () => void
  /**
   * Updates the page selection like a file manager: 'single' selects only this
   * page, 'toggle' adds/removes it (Ctrl/⌘+click), 'range' selects from the
   * anchor to this page (Shift+click). `orderedIds` is the current page order.
   */
  selectPage: (
    id: string,
    mode: 'single' | 'toggle' | 'range',
    orderedIds: readonly string[],
  ) => void
  setSelection: (ids: string[]) => void
  clearSelection: () => void
  reset: () => void
}

let navigationId = 0

const initialState = {
  zoomMode: 'fit-width' as ZoomMode,
  scale: 1,
  currentPage: 1,
  navigation: null,
  selectedIds: [] as string[],
  selectionAnchor: null as string | null,
}

export const useViewerStore = create<ViewerState>()((set, get) => ({
  ...initialState,
  sidebarOpen: true,

  setZoom: (scale) => set({ zoomMode: 'custom', scale: clampZoom(scale) }),
  setZoomMode: (zoomMode) => set({ zoomMode }),
  zoomIn: () => get().setZoom(stepZoom(get().scale, 1)),
  zoomOut: () => get().setZoom(stepZoom(get().scale, -1)),
  applyFitScale: (scale) => {
    if (get().zoomMode !== 'custom' && Math.abs(get().scale - scale) > 0.0001) set({ scale })
  },
  goToPage: (page, { onlyIfHidden = false } = {}) =>
    set({ currentPage: page, navigation: { page, id: ++navigationId, onlyIfHidden } }),
  setCurrentPage: (currentPage) => {
    if (get().currentPage !== currentPage) set({ currentPage })
  },
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  selectPage: (id, mode, orderedIds) => {
    const { selectedIds, selectionAnchor } = get()
    if (mode === 'toggle') {
      const selected = selectedIds.includes(id)
      set({
        selectedIds: selected ? selectedIds.filter((other) => other !== id) : [...selectedIds, id],
        selectionAnchor: id,
      })
    } else if (mode === 'range' && selectionAnchor && orderedIds.includes(selectionAnchor)) {
      const from = orderedIds.indexOf(selectionAnchor)
      const to = orderedIds.indexOf(id)
      set({ selectedIds: orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1) })
    } else {
      set({ selectedIds: [id], selectionAnchor: id })
    }
  },
  setSelection: (selectedIds) => set({ selectedIds, selectionAnchor: selectedIds.at(-1) ?? null }),
  clearSelection: () => set({ selectedIds: [], selectionAnchor: null }),
  reset: () => set(initialState),
}))

// Reset zoom, page and pending navigation synchronously whenever another document
// is opened or closed, so the new document never sees the previous view state.
useDocumentStore.subscribe((state, previous) => {
  if (state.document?.id !== previous.document?.id) {
    useViewerStore.getState().reset()
  } else if (state.document && state.document.pages !== previous.document?.pages) {
    // Pages were edited: forget selected pages that no longer exist
    const existing = new Set(state.document.pages.map((page) => page.id))
    const { selectedIds, selectionAnchor } = useViewerStore.getState()
    const kept = selectedIds.filter((id) => existing.has(id))
    if (kept.length !== selectedIds.length || (selectionAnchor && !existing.has(selectionAnchor))) {
      useViewerStore.setState({
        selectedIds: kept,
        selectionAnchor: selectionAnchor && existing.has(selectionAnchor) ? selectionAnchor : null,
      })
    }
  }
})
