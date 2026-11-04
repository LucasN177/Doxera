import { create } from 'zustand'
import { clampZoom, stepZoom, type ZoomMode } from '@/lib/zoom'
import { useDocumentStore } from './documentStore'

interface NavigationRequest {
  /** 1-based page number. */
  page: number
  /** Unique per request, so navigating to the same page twice still scrolls. */
  id: number
}

interface ViewerState {
  zoomMode: ZoomMode
  /** Scale actually used for rendering (derived from the zoom mode for fit modes). */
  scale: number
  /** 1-based number of the page currently in view. */
  currentPage: number
  navigation: NavigationRequest | null
  sidebarOpen: boolean

  setZoom: (scale: number) => void
  setZoomMode: (mode: Exclude<ZoomMode, 'custom'>) => void
  zoomIn: () => void
  zoomOut: () => void
  /** Called by the viewer when a fit mode resolves to a concrete scale. */
  applyFitScale: (scale: number) => void
  goToPage: (page: number) => void
  /** Called by the viewer while scrolling; does not trigger navigation. */
  setCurrentPage: (page: number) => void
  toggleSidebar: () => void
  reset: () => void
}

let navigationId = 0

const initialState = {
  zoomMode: 'fit-width' as ZoomMode,
  scale: 1,
  currentPage: 1,
  navigation: null,
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
  goToPage: (page) => set({ currentPage: page, navigation: { page, id: ++navigationId } }),
  setCurrentPage: (currentPage) => {
    if (get().currentPage !== currentPage) set({ currentPage })
  },
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  reset: () => set(initialState),
}))

// Reset zoom, page and pending navigation synchronously whenever another document
// is opened or closed, so the new document never sees the previous view state.
useDocumentStore.subscribe((state, previous) => {
  if (state.document?.id !== previous.document?.id) useViewerStore.getState().reset()
})
