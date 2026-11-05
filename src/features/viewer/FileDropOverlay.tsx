import { FileDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { insertImage } from '@/features/annotations/insertImage'
import { useOpenDocument } from '@/hooks/useOpenDocument'
import { addImagesForPdf } from '@/features/convert/pickImages'
import { looksLikePdf } from '@/lib/file'
import { looksLikeImage, prepareImage } from '@/lib/images'
import { useDocumentStore } from '@/stores/documentStore'
import { useUiStore } from '@/stores/uiStore'
import { addBatchFiles } from '@/features/batch/pickBatchFiles'
import { t } from '@/i18n'

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

/** Accepts PDF files dropped anywhere on the window and shows a drop hint while dragging. */
export function FileDropOverlay() {
  const { open } = useOpenDocument()
  const [dragging, setDragging] = useState(false)
  // dragenter/dragleave fire for every child element, so count nesting depth
  const depth = useRef(0)

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current++
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current = 0
      setDragging(false)

      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      const ui = useUiStore.getState()
      // Open dialogs that collect files take them
      if (ui.batchFiles !== null) {
        if (addBatchFiles(files) === 0) toast.error(t('Bitte PDFs oder Bilder ablegen.'))
        return
      }
      if (ui.imagesToPdf !== null) {
        if (!files.some(looksLikeImage)) toast.error(t('Bitte Bilder ablegen.'))
        addImagesForPdf(files)
        return
      }
      const [first] = files
      const images = files.filter((file) => looksLikeImage(file) && !looksLikePdf(file))
      const hasDocument = useDocumentStore.getState().document !== null
      // Several pictures, or pictures without an open document: make pages of them
      if (images.length > 0 && !files.some(looksLikePdf) && (!hasDocument || images.length > 1)) {
        addImagesForPdf(images)
        return
      }
      // A single picture dropped onto an open document is placed on the current page
      if (hasDocument && looksLikeImage(first) && !looksLikePdf(first)) {
        void prepareImage(first)
          .then((image) => insertImage(image))
          .catch(() =>
            toast.error(t('„{name}“ konnte nicht als Bild gelesen werden.', { name: first.name })),
          )
        return
      }
      if (files.length > 1) toast.info(t('Es wird nur die erste Datei geöffnet.'))
      void open(first)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [open])

  if (!dragging) return null
  const hasDocument = useDocumentStore.getState().document !== null
  const ui = useUiStore.getState()
  const hint =
    ui.batchFiles !== null
      ? t('Dateien zur Stapelverarbeitung hinzufügen')
      : ui.imagesToPdf !== null
        ? t('Bilder hinzufügen')
        : hasDocument
          ? t('PDF zum Öffnen oder Bild zum Einfügen ablegen')
          : t('PDF hier ablegen zum Öffnen')

  return (
    <div className="bg-primary/10 pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-6 backdrop-blur-[2px]">
      <div className="border-primary bg-background/95 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-12 py-10 shadow-lg">
        <FileDown className="text-primary size-10" aria-hidden />
        <p className="text-lg font-medium">{hint}</p>
      </div>
    </div>
  )
}
