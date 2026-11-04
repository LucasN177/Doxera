import type { PDFDocumentProxy } from 'pdfjs-dist'
import { buildPdf } from '@/engine/document/buildPdf'
import { isUnmodified } from '@/engine/document/pageOps'
import { closePdf, MAX_CANVAS_PIXELS, openPdf } from '@/engine/render/pdfjs'
import { getPrimarySource, useDocumentStore } from '@/stores/documentStore'

export type ImageFormat = 'png' | 'jpeg'

export interface RenderImagesOptions {
  pageIds: ReadonlySet<string>
  format: ImageFormat
  /** Resolution in dots per inch (72 = 1 pixel per point). */
  dpi: number
  onProgress: (done: number, total: number) => void
  signal: AbortSignal
}

function baseName(name: string) {
  return name.replace(/\.pdf$/i, '') || 'Dokument'
}

function canvasToBlob(canvas: HTMLCanvasElement, format: ImageFormat) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Bild konnte nicht erstellt werden.'))),
      `image/${format}`,
      format === 'jpeg' ? 0.9 : undefined,
    ),
  )
}

/**
 * Renders the given pages as image files, exactly as exported: annotations,
 * crop, rotation, edits, recognized text and redactions are applied first (a
 * redacted area is black in the image, too).
 */
export async function renderPagesAsImages({
  pageIds,
  format,
  dpi,
  onProgress,
  signal,
}: RenderImagesOptions): Promise<File[]> {
  const state = useDocumentStore.getState()
  const document = state.document
  const primary = getPrimarySource(state)
  if (!document || !primary) return []
  const numbers: number[] = []
  const refs = document.pages.filter((page, index) => {
    if (!pageIds.has(page.id)) return false
    numbers.push(index + 1)
    return true
  })
  if (refs.length === 0) return []

  // Unchanged pages render straight from the opened file
  const unchanged = refs.length === document.pages.length && isUnmodified(refs, primary)
  let pdf: PDFDocumentProxy
  if (unchanged) {
    pdf = primary.pdf
  } else {
    const data = await buildPdf(refs, state.sources, { assets: state.assets })
    pdf = await openPdf(data)
  }

  const files: File[] = []
  const digits = String(document.pages.length).length
  try {
    for (const [index, number] of numbers.entries()) {
      if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError')
      const page = await pdf.getPage(index + 1)
      const base = page.getViewport({ scale: 1 })
      const preferred = dpi / 72
      const pixels = base.width * base.height * preferred * preferred
      // Within the canvas limit of iPhone/iPad
      const scale =
        pixels <= MAX_CANVAS_PIXELS ? preferred : preferred * Math.sqrt(MAX_CANVAS_PIXELS / pixels)
      const viewport = page.getViewport({ scale })
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const context = canvas.getContext('2d')!
      // JPEG has no transparency: white like paper
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, viewport }).promise
      const blob = await canvasToBlob(canvas, format)
      canvas.width = 0 // free memory right away (iOS)
      const extension = format === 'png' ? 'png' : 'jpg'
      const label = String(number).padStart(digits, '0')
      files.push(
        new File([blob], `${baseName(document.name)}-seite-${label}.${extension}`, {
          type: blob.type,
        }),
      )
      onProgress(index + 1, numbers.length)
    }
  } finally {
    if (!unchanged) void closePdf(pdf)
  }
  return files
}
