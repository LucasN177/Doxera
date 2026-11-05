import { useEffect } from 'react'
import { toast } from 'sonner'
import { addBatchFiles } from '@/features/batch/pickBatchFiles'
import { addImagesForPdf } from '@/features/convert/pickImages'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { looksLikePdf } from '@/lib/file'
import { looksLikeImage } from '@/lib/images'

/** What the Launch Handler API hands over (not yet in TypeScript's DOM types). */
interface LaunchParams {
  files: readonly FileSystemFileHandle[]
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}

/**
 * What to do with files the system opens Doxera with: one PDF is opened,
 * several PDFs go to batch processing, pictures become a PDF.
 */
export async function handleLaunchedFiles(
  files: readonly File[],
  open: (file: File) => Promise<boolean>,
) {
  const pdfs = files.filter(looksLikePdf)
  const images = files.filter((file) => looksLikeImage(file) && !looksLikePdf(file))
  if (pdfs.length === 1 && images.length === 0) {
    await open(pdfs[0]!)
  } else if (pdfs.length > 1) {
    addBatchFiles(files)
  } else if (images.length > 0) {
    addImagesForPdf(images)
  } else if (files.length > 0) {
    toast.error('Doxera öffnet PDFs und Bilder.')
  }
}

/**
 * Opens files handed over by the operating system ("Open with Doxera",
 * double click on a PDF) when the installed app is started that way.
 * Supported by Chromium-based browsers on desktop; elsewhere nothing happens.
 */
export function useLaunchQueue() {
  const { open } = useOpenDocument()
  useEffect(() => {
    const queue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue
    if (!queue) return
    queue.setConsumer((params) => {
      if (!params.files?.length) return
      void Promise.all(params.files.map((handle) => handle.getFile()))
        .then((files) => handleLaunchedFiles(files, open))
        .catch((error: unknown) => {
          console.error('Übergebene Dateien konnten nicht gelesen werden', error)
          toast.error('Die Datei konnte nicht geöffnet werden.')
        })
    })
  }, [open])
}
