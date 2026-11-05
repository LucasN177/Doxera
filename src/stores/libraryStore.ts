import type { PDFDocumentProxy } from 'pdfjs-dist'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { renderThumbnail } from '@/engine/render/pdfjs'
import { deleteDatabase, type LibraryEntry } from '@/storage/db'
import {
  deleteEntries,
  getEntry,
  hashBytes,
  listEntries,
  loadFile,
  pruneLibrary,
  saveEntry,
} from '@/storage/documentLibrary'
import type { OpenDocument } from '@/types/document'

/** How many documents the library keeps; older ones are removed automatically. */
export const MAX_LIBRARY_ENTRIES = 20

const THUMBNAIL_WIDTH = 160

/** All localStorage keys written by Doxera start with this prefix. */
const LOCAL_STORAGE_PREFIX = 'doxera-'

export interface RemovedDocument {
  entry: LibraryEntry
  data: Uint8Array | null
}

interface LibraryState {
  entries: LibraryEntry[]
  loaded: boolean
  /** False if IndexedDB is unavailable (e.g. blocked by the browser). */
  available: boolean
  /** User setting: keep opened documents in the local library. */
  rememberDocuments: boolean

  load: () => Promise<void>
  /** Adds the opened document to the library or marks it as recently opened. */
  remember: (document: OpenDocument, pdf: PDFDocumentProxy) => Promise<void>
  /** Loads the file contents of an entry, or `null` if it's gone. */
  loadData: (id: string) => Promise<Uint8Array | null>
  /** Removes an entry; the result can be passed to {@link restore} to undo. */
  remove: (id: string) => Promise<RemovedDocument | null>
  restore: (removed: RemovedDocument) => Promise<void>
  /**
   * Deletes everything Doxera stores locally: the IndexedDB database with all
   * documents and the settings in localStorage (settings return to defaults).
   */
  wipeAllData: () => Promise<void>
  setRememberDocuments: (remember: boolean) => void
}

let persistenceRequested = false

/** Asks the browser not to evict our storage under pressure (best effort, no prompt in most browsers). */
function requestPersistentStorage() {
  if (persistenceRequested) return
  persistenceRequested = true
  void navigator.storage?.persist?.().catch(() => false)
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => {
      const refresh = async () => {
        set({ entries: await listEntries(), loaded: true, available: true })
      }

      return {
        entries: [],
        loaded: false,
        available: true,
        rememberDocuments: true,

        load: async () => {
          try {
            await refresh()
          } catch (error) {
            console.warn('Lokale Bibliothek nicht verfügbar', error)
            set({ loaded: true, available: false, entries: [] })
          }
        },

        remember: async (document, pdf) => {
          if (!get().rememberDocuments || !get().available) return
          const id = await hashBytes(document.data)
          const existing = await getEntry(id)
          const now = Date.now()

          if (existing) {
            await saveEntry({ ...existing, name: document.name, lastOpenedAt: now })
          } else {
            const thumbnail = await renderThumbnail(pdf, 1, THUMBNAIL_WIDTH).catch(() => null)
            await saveEntry(
              {
                id,
                name: document.name,
                size: document.size,
                pageCount: pdf.numPages,
                thumbnail,
                addedAt: now,
                lastOpenedAt: now,
              },
              // Protected files stay protected on the device
              document.originalData ?? document.data,
            )
            requestPersistentStorage()
            await pruneLibrary(MAX_LIBRARY_ENTRIES)
          }
          await refresh()
        },

        loadData: (id) => loadFile(id),

        remove: async (id) => {
          const entry = get().entries.find((candidate) => candidate.id === id)
          if (!entry) return null
          const data = await loadFile(id)
          await deleteEntries([id])
          await refresh()
          return { entry, data }
        },

        restore: async ({ entry, data }) => {
          await saveEntry(entry, data ?? undefined)
          await refresh()
        },

        wipeAllData: async () => {
          await deleteDatabase()
          // Reset in memory first: every set() is persisted, so clear storage afterwards
          set({ entries: [], loaded: true, available: true, rememberDocuments: true })
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith(LOCAL_STORAGE_PREFIX)) localStorage.removeItem(key)
          }
        },

        setRememberDocuments: (rememberDocuments) => set({ rememberDocuments }),
      }
    },
    {
      name: `${LOCAL_STORAGE_PREFIX}library-settings`,
      storage: createJSONStorage(() => localStorage),
      // Only the setting is persisted here; documents live in IndexedDB
      partialize: (state) => ({ rememberDocuments: state.rememberDocuments }),
    },
  ),
)
