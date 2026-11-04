import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useRef } from 'react'
import { renderPage, type RenderHandle } from '@/engine/render/pdfjs'
import { cn } from '@/lib/utils'

interface PageCanvasProps {
  pdf: PDFDocumentProxy
  /** 1-based page number. */
  pageNumber: number
  scale: number
  className?: string
}

/**
 * Renders one PDF page, filling its (absolutely positioned) parent. While a new
 * scale renders, the previous canvas stays visible (stretched) to avoid flicker.
 */
export function PageCanvas({ pdf, pageNumber, scale, className }: PageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const job: { cancelled: boolean; handle: RenderHandle | null } = {
      cancelled: false,
      handle: null,
    }

    pdf
      .getPage(pageNumber)
      .then((page) => {
        if (job.cancelled) return null
        job.handle = renderPage(page, scale)
        return job.handle.promise
      })
      .then((canvas) => {
        if (job.cancelled || !canvas || !containerRef.current) return
        canvas.className = 'block size-full'
        containerRef.current.replaceChildren(canvas)
      })
      .catch((error: unknown) => {
        if (!job.cancelled)
          console.error(`Seite ${pageNumber} konnte nicht gerendert werden`, error)
      })

    return () => {
      job.cancelled = true
      job.handle?.cancel()
    }
  }, [pdf, pageNumber, scale])

  return <div ref={containerRef} className={cn('absolute inset-0', className)} aria-hidden />
}
