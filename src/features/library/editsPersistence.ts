import { toast } from 'sonner'
import { captureEdits } from '@/engine/document/editState'
import { pagesFromSource } from '@/engine/document/pageOps'
import { formatRelativeTime } from '@/lib/time'
import { hashBytes } from '@/storage/documentLibrary'
import { deleteEdits, loadEdits, saveEdits } from '@/storage/edits'
import { getPrimarySource, useDocumentStore } from '@/stores/documentStore'
import { useLibraryStore } from '@/stores/libraryStore'

/** Wait this long after the last change before saving. */
const SAVE_DELAY = 800

/** Library id (content hash) of each opened file's data. */
const ids = new WeakMap<Uint8Array, Promise<string>>()

function libraryId(data: Uint8Array): Promise<string> {
  let id = ids.get(data)
  if (!id) {
    id = hashBytes(data)
    ids.set(data, id)
  }
  return id
}

/** Saves (or clears) the edit state of the open document. */
async function save() {
  const { document, sources, assets } = useDocumentStore.getState()
  const primary = getPrimarySource(useDocumentStore.getState())
  const library = useLibraryStore.getState()
  if (!document || !primary || !library.rememberDocuments || !library.available) return
  const id = await libraryId(document.data)
  const edits = captureEdits(id, document.pages, primary, sources, assets, Date.now())
  if (edits) await saveEdits(edits)
  else await deleteEdits(id)
}

/**
 * Keeps the changes to the open document in IndexedDB, shortly after each
 * change and when the page is hidden (tab switch, closing, iOS app switch).
 * Returns a function that stops it.
 */
export function startEditsPersistence(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    void save().catch((error: unknown) => {
      console.warn('Bearbeitungen konnten nicht lokal gespeichert werden', error)
    })
  }
  const unsubscribe = useDocumentStore.subscribe((state, previous) => {
    const changed =
      state.document?.pages !== previous.document?.pages ||
      state.assets !== previous.assets ||
      state.sources !== previous.sources
    // Opening another file: nothing changed in the previous one
    if (!changed || !state.document || state.document.id !== previous.document?.id) return
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DELAY)
  })
  const onHide = () => {
    if (timer !== undefined && document.visibilityState === 'hidden') flush()
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', flush)
  return () => {
    unsubscribe()
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', flush)
  }
}

/**
 * Brings back saved changes of the file that was just opened, with a note
 * and an undoable way back to the original.
 */
export async function restoreSavedEdits() {
  const library = useLibraryStore.getState()
  const document = useDocumentStore.getState().document
  if (!document || !library.rememberDocuments || !library.available) return
  try {
    const edits = await loadEdits(await libraryId(document.data))
    if (!edits || useDocumentStore.getState().document?.id !== document.id) return
    if (!(await useDocumentStore.getState().restoreEdits(edits))) return
    toast.success('Deine Bearbeitungen wurden wiederhergestellt', {
      description: `Zuletzt geändert ${formatRelativeTime(edits.savedAt)}.`,
      duration: 8000,
      action: {
        label: 'Original anzeigen',
        onClick: () => {
          const primary = getPrimarySource(useDocumentStore.getState())
          // Undoable, so the changes can be brought back with Undo
          if (primary) useDocumentStore.getState().edit(() => pagesFromSource(primary))
        },
      },
    })
  } catch (error) {
    console.warn('Gespeicherte Bearbeitungen konnten nicht geladen werden', error)
  }
}
