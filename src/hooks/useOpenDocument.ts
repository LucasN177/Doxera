import { useCallback } from 'react'
import { toast } from 'sonner'
import { addImagesForPdf, IMAGE_ACCEPT } from '@/features/convert/pickImages'
import { restoreSavedEdits } from '@/features/library/editsPersistence'
import { looksLikePdf, pickFiles } from '@/lib/file'
import { useDocumentStore, type OpenResult } from '@/stores/documentStore'
import { useLibraryStore } from '@/stores/libraryStore'
import { t } from '@/i18n'

const PDF_ACCEPT = 'application/pdf,.pdf'
/** The picker also offers images: they are turned into a PDF. */
const OPEN_ACCEPT = `${PDF_ACCEPT},${IMAGE_ACCEPT}`

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
        toast.warning(t('Nicht genug Speicherplatz, um das Dokument lokal zu merken.'))
      }
    })
}

/** Opening documents from files, the file picker or the library, with user feedback on errors. */
export function useOpenDocument() {
  const openFile = useDocumentStore((state) => state.openFile)
  const openData = useDocumentStore((state) => state.openData)

  const handle = useCallback(async (result: OpenResult) => {
    if (result.ok) {
      await restoreSavedEdits()
      rememberOpenDocument()
    } else if (!result.cancelled) {
      toast.error(result.message)
    }
    return result.ok
  }, [])

  const open = useCallback(async (file: File) => handle(await openFile(file)), [openFile, handle])

  const openFromPicker = useCallback(async () => {
    const files = await pickFiles(OPEN_ACCEPT, true)
    const pdf = files.find(looksLikePdf)
    if (pdf) {
      if (files.length > 1) toast.info(t('Es wird nur die erste PDF geöffnet.'))
      await open(pdf)
    } else {
      addImagesForPdf(files)
    }
  }, [open])

  const openFromLibrary = useCallback(
    async (id: string, name: string) => {
      const data = await useLibraryStore
        .getState()
        .loadData(id)
        .catch(() => null)
      if (!data) {
        toast.error(t('„{name}“ ist nicht mehr im lokalen Speicher vorhanden.', { name }))
        void useLibraryStore.getState().load()
        return false
      }
      return handle(await openData(name, data))
    },
    [openData, handle],
  )

  return { open, openFromPicker, openFromLibrary }
}
