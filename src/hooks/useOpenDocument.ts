import { useCallback } from 'react'
import { toast } from 'sonner'
import { pickFiles } from '@/lib/file'
import { useDocumentStore, type OpenResult } from '@/stores/documentStore'
import { useLibraryStore } from '@/stores/libraryStore'

const PDF_ACCEPT = 'application/pdf,.pdf'

/** Stores the now open document in the local library, without blocking the UI. */
function rememberOpenDocument() {
  const { document, pdf } = useDocumentStore.getState()
  if (!document || !pdf) return
  useLibraryStore
    .getState()
    .remember(document, pdf)
    .catch((error: unknown) => {
      console.warn('Dokument konnte nicht lokal gespeichert werden', error)
      if ((error as Error | undefined)?.name === 'QuotaExceededError') {
        toast.warning('Nicht genug Speicherplatz, um das Dokument lokal zu merken.')
      }
    })
}

/** Opening documents from files, the file picker or the library, with user feedback on errors. */
export function useOpenDocument() {
  const openFile = useDocumentStore((state) => state.openFile)
  const openData = useDocumentStore((state) => state.openData)

  const handle = useCallback((result: OpenResult) => {
    if (result.ok) rememberOpenDocument()
    else if (!result.cancelled) toast.error(result.message)
    return result.ok
  }, [])

  const open = useCallback(async (file: File) => handle(await openFile(file)), [openFile, handle])

  const openFromPicker = useCallback(async () => {
    const [file] = await pickFiles(PDF_ACCEPT)
    if (file) await open(file)
  }, [open])

  const openFromLibrary = useCallback(
    async (id: string, name: string) => {
      const data = await useLibraryStore
        .getState()
        .loadData(id)
        .catch(() => null)
      if (!data) {
        toast.error(`„${name}“ ist nicht mehr im lokalen Speicher vorhanden.`)
        void useLibraryStore.getState().load()
        return false
      }
      return handle(await openData(name, data))
    },
    [openData, handle],
  )

  return { open, openFromPicker, openFromLibrary }
}
