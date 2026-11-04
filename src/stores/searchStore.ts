import { create } from 'zustand'
import { loadDocumentTexts } from '@/engine/search/searchIndex'
import { searchPages, type SearchMatch } from '@/engine/search/textSearch'
import { useDocumentStore } from './documentStore'
import { useViewerStore } from './viewerStore'

interface RevealRequest {
  matchIndex: number
  /** Unique per request; the text layer scrolls a match into view once per id. */
  id: number
}

interface SearchState {
  open: boolean
  query: string
  matchCase: boolean
  /** True while page texts are being extracted for the first search. */
  indexing: boolean
  indexedPages: number
  /** Number of pages to extract in total (all used source files). */
  indexTotal: number
  /** True while a search for the current query is pending. */
  searching: boolean
  matches: SearchMatch[]
  /** Index into `matches` of the selected match, or -1. */
  activeIndex: number
  reveal: RevealRequest | null
  /** Id of the last reveal request that was scrolled into view. */
  revealedId: number
  /** Incremented to ask the search field to take focus. */
  focusRequest: number

  openSearch: () => void
  close: () => void
  setQuery: (query: string) => void
  setMatchCase: (matchCase: boolean) => void
  next: () => void
  previous: () => void
  markRevealed: (id: number) => void
  /** Re-runs the current search after the pages changed. */
  refresh: () => void
  reset: () => void
}

const DEBOUNCE_MS = 200

let searchToken = 0
let revealId = 0
let debounceTimer: ReturnType<typeof setTimeout> | undefined

const initialState = {
  open: false,
  query: '',
  matchCase: false,
  indexing: false,
  indexedPages: 0,
  indexTotal: 0,
  searching: false,
  matches: [] as SearchMatch[],
  activeIndex: -1,
  reveal: null,
  revealedId: 0,
}

export const useSearchStore = create<SearchState>()((set, get) => {
  /** Selects a match and scrolls to it. */
  const select = (matchIndex: number, reveal = true) => {
    const match = get().matches[matchIndex]
    if (!match) return
    if (!reveal) {
      set({ activeIndex: matchIndex })
      return
    }
    set({ activeIndex: matchIndex, reveal: { matchIndex, id: ++revealId } })
    useViewerStore.getState().goToPage(match.pageIndex + 1, { onlyIfHidden: true })
  }

  /** Runs the search. With `reveal: false` (after page edits) the view doesn't jump. */
  const run = async ({ reveal = true } = {}) => {
    clearTimeout(debounceTimer)
    const token = ++searchToken
    const { query, matchCase, open } = get()
    const { document, sources } = useDocumentStore.getState()

    if (!open || !document || !query.trim()) {
      set({ matches: [], activeIndex: -1, reveal: null, searching: false })
      return
    }

    set({ searching: true })
    let pages
    try {
      pages = await loadDocumentTexts(document.pages, sources, (done, total) => {
        if (token === searchToken) {
          set({ indexing: done < total, indexedPages: done, indexTotal: total })
        }
      })
    } catch {
      if (token === searchToken) set({ searching: false, indexing: false })
      return
    }
    if (token !== searchToken) return

    const matches = searchPages(pages, query, { matchCase })
    set({ matches, searching: false, indexing: false, activeIndex: -1, reveal: null })

    // Start at the first match on or after the page currently in view
    const currentIndex = useViewerStore.getState().currentPage - 1
    const first = matches.findIndex((match) => match.pageIndex >= currentIndex)
    if (matches.length > 0) select(first === -1 ? 0 : first, reveal)
  }

  const schedule = () => {
    clearTimeout(debounceTimer)
    set({ searching: true })
    debounceTimer = setTimeout(() => void run(), DEBOUNCE_MS)
  }

  return {
    ...initialState,
    focusRequest: 0,

    openSearch: () => {
      const wasOpen = get().open
      set((state) => ({ open: true, focusRequest: state.focusRequest + 1 }))
      if (!wasOpen && get().query.trim()) void run()
    },
    close: () => {
      clearTimeout(debounceTimer)
      searchToken++
      set({ open: false, matches: [], activeIndex: -1, reveal: null, searching: false })
    },
    setQuery: (query) => {
      set({ query })
      schedule()
    },
    setMatchCase: (matchCase) => {
      set({ matchCase })
      void run()
    },
    next: () => {
      const { matches, activeIndex } = get()
      if (matches.length > 0) select((activeIndex + 1) % matches.length)
    },
    previous: () => {
      const { matches, activeIndex } = get()
      if (matches.length > 0) select((activeIndex - 1 + matches.length) % matches.length)
    },
    markRevealed: (id) => set({ revealedId: id }),
    refresh: () => {
      if (get().open && get().query.trim()) void run({ reveal: false })
    },
    reset: () => {
      clearTimeout(debounceTimer)
      searchToken++
      set(initialState)
    },
  }
})

// Results belong to a document: drop them when another document is opened or closed
useDocumentStore.subscribe((state, previous) => {
  if (state.document?.id !== previous.document?.id) {
    useSearchStore.getState().reset()
  } else if (state.document && state.document.pages !== previous.document?.pages) {
    // Pages were edited: page positions changed, so search again (without jumping)
    useSearchStore.getState().refresh()
  }
})
