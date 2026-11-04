import { create } from 'zustand'

export type PageDialog = 'split' | 'crop'

interface UiState {
  shortcutsOpen: boolean
  openShortcuts: () => void
  setShortcutsOpen: (open: boolean) => void
  /** Page tool dialog that is currently open, if any. */
  pageDialog: PageDialog | null
  openPageDialog: (dialog: PageDialog) => void
  closePageDialog: () => void
}

/** Transient UI state that isn't tied to a document. */
export const useUiStore = create<UiState>()((set) => ({
  shortcutsOpen: false,
  openShortcuts: () => set({ shortcutsOpen: true }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  pageDialog: null,
  openPageDialog: (pageDialog) => set({ pageDialog }),
  closePageDialog: () => set({ pageDialog: null }),
}))
