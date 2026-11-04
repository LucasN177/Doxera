import { useCallback } from 'react'
import { toast } from 'sonner'
import { pickFiles } from '@/lib/file'
import { useDocumentStore } from '@/stores/documentStore'

const PDF_ACCEPT = 'application/pdf,.pdf'

/** Opening documents from files or the file picker, with user feedback on errors. */
export function useOpenDocument() {
  const openFile = useDocumentStore((state) => state.openFile)

  const open = useCallback(
    async (file: File) => {
      const result = await openFile(file)
      if (!result.ok && !result.cancelled) toast.error(result.message)
      return result.ok
    },
    [openFile],
  )

  const openFromPicker = useCallback(async () => {
    const [file] = await pickFiles(PDF_ACCEPT)
    if (file) await open(file)
  }, [open])

  return { open, openFromPicker }
}
