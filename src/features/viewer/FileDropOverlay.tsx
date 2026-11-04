import { FileDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useOpenDocument } from '@/hooks/useOpenDocument'

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
      if (files.length > 1) toast.info('Es wird nur die erste Datei geöffnet.')
      void open(files[0])
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

  return (
    <div className="bg-primary/10 pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-[2px]">
      <div className="border-primary bg-background/95 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-12 py-10 shadow-lg">
        <FileDown className="text-primary size-10" aria-hidden />
        <p className="text-lg font-medium">PDF hier ablegen zum Öffnen</p>
      </div>
    </div>
  )
}
