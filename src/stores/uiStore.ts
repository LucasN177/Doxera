import { create } from 'zustand'

interface UiState {
  shortcutsOpen: boolean
  openShortcuts: () => void
  setShortcutsOpen: (open: boolean) => void
}

/** Transient UI state that isn't tied to a document. */
export const useUiStore = create<UiState>()((set) => ({
  shortcutsOpen: false,
  openShortcuts: () => set({ shortcutsOpen: true }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}))
