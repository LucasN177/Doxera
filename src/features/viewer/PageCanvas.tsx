import type { PDFDocumentProxy } from 'pdfjs-dist'
import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { renderPage, type RenderHandle } from '@/engine/render/pdfjs'
import { cn } from '@/lib/utils'

interface PageCanvasProps {
  pdf: PDFDocumentProxy
  /** 1-based page number. */
  pageNumber: number
  scale: number
  /** Rotation added in the editor (0, 90, 180, 270). */
  rotation?: number
  className?: string
  /** Show a short error text if rendering fails (off for tiny thumbnails). */
  showError?: boolean
}

/**
 * Renders one PDF page, filling its (absolutely positioned) parent. While a new
 * scale renders, the previous canvas stays visible (stretched) to avoid flicker.
 */
export function PageCanvas({
  pdf,
  pageNumber,
  scale,
  rotation = 0,
  className,
  showError = true,
}: PageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const job: { cancelled: boolean; handle: RenderHandle | null } = {
      cancelled: false,
      handle: null,
    }

    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (job.cancelled) return null
        job.handle = renderPage(page, scale, rotation)
        return job.handle.promise
      })
      .then((canvas) => {
        if (job.cancelled || !canvas || !containerRef.current) return
        canvas.className = 'block size-full'
        containerRef.current.replaceChildren(canvas)
        setFailed(false)
      })
      .catch((error: unknown) => {
        if (job.cancelled) return
        console.error(`Seite ${pageNumber} konnte nicht gerendert werden`, error)
        setFailed(true)
      })

    return () => {
      job.cancelled = true
      job.handle?.cancel()
    }
  }, [pdf, pageNumber, scale, rotation])

  return (
    <>
      <div ref={containerRef} className={cn('absolute inset-0', className)} aria-hidden />
      {failed && (
        <div
          role="status"
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-4 text-center text-sm text-neutral-500',
            !showError && 'sr-only',
          )}
        >
          <TriangleAlert className="size-6 text-amber-500" aria-hidden />
          Seite {pageNumber} konnte nicht dargestellt werden.
        </div>
      )}
    </>
  )
}
