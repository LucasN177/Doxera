import type { PDFDocumentProxy } from 'pdfjs-dist'
import { documentBytes, isDocumentUnchanged } from '@/features/document/documentBytes'
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
  const unchanged = refs.length === document.pages.length && isDocumentUnchanged(refs)
  let pdf: PDFDocumentProxy
  if (unchanged) {
    pdf = primary.pdf
  } else {
    pdf = await openPdf(await documentBytes({ pages: refs }))
  }

  try {
    return await renderPdfPages(
      pdf,
      numbers.map((number, index) => ({ index, number })),
      { format, dpi, name: baseName(document.name), digits: String(document.pages.length).length },
      onProgress,
      signal,
    )
  } finally {
    if (!unchanged) void closePdf(pdf)
  }
}

/**
 * Renders pages of an opened PDF as image files named
 * "<name>-seite-<number>.png|jpg".
 *
 * @param pages 0-based page index in `pdf` and the page number for the file name.
 */
export async function renderPdfPages(
  pdf: PDFDocumentProxy,
  pages: ReadonlyArray<{ index: number; number: number }>,
  options: { format: ImageFormat; dpi: number; name: string; digits: number },
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<File[]> {
  const { format, dpi, name, digits } = options
  const files: File[] = []
  for (const [done, { index, number }] of pages.entries()) {
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
    files.push(new File([blob], `${name}-seite-${label}.${extension}`, { type: blob.type }))
    onProgress(done + 1, pages.length)
  }
  return files
}
