import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PageSize } from '@/types/document'

type PdfJs = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfJs> | null = null

/** Lazily loads pdf.js so it isn't part of the initial bundle. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    return pdfjs
  })
  return pdfjsPromise
}

/** Static pdf.js resources (CMaps, standard fonts, WASM decoders), copied at build time. */
const ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`

export type PdfLoadErrorReason = 'password' | 'invalid' | 'unknown'

export class PdfLoadError extends Error {
  readonly reason: PdfLoadErrorReason

  constructor(reason: PdfLoadErrorReason, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PdfLoadError'
    this.reason = reason
  }
}

/**
 * Opens a PDF from raw bytes. The bytes are copied because pdf.js transfers
 * the buffer to its worker, which would detach the caller's copy.
 */
export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({
    data: data.slice(),
    cMapUrl: `${ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSET_BASE}standard_fonts/`,
    wasmUrl: `${ASSET_BASE}wasm/`,
    iccUrl: `${ASSET_BASE}iccs/`,
  })

  try {
    return await task.promise
  } catch (error) {
    const name = (error as Error | undefined)?.name
    if (name === 'PasswordException') {
      throw new PdfLoadError('password', 'Passwortgeschützte PDFs werden noch nicht unterstützt.', {
        cause: error,
      })
    }
    if (name === 'InvalidPDFException') {
      throw new PdfLoadError('invalid', 'Die Datei ist keine gültige oder eine beschädigte PDF.', {
        cause: error,
      })
    }
    throw new PdfLoadError('unknown', 'Die PDF konnte nicht geöffnet werden.', { cause: error })
  }
}

/** Releases all resources (worker, caches) held for a document. */
export function closePdf(pdf: PDFDocumentProxy): Promise<void> {
  return pdf.loadingTask.destroy()
}

/** Reads the unscaled size (in PDF points, rotation applied) of every page. */
export async function getPageSizes(pdf: PDFDocumentProxy): Promise<PageSize[]> {
  const pages = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
  )
  return pages.map((page) => {
    const { width, height } = page.getViewport({ scale: 1 })
    return { width, height }
  })
}

export interface RenderHandle {
  /** Resolves with the rendered canvas, or `null` if the render was cancelled. */
  promise: Promise<HTMLCanvasElement | null>
  cancel: () => void
}

/** Upper bound for the device pixel ratio to keep canvas memory in check. */
const MAX_PIXEL_RATIO = 2

/**
 * Renders a page into a fresh canvas. Using a new canvas per render lets the
 * caller keep showing the previous result until the new one is ready and avoids
 * pdf.js' "same canvas in multiple render() operations" error.
 */
export function renderPage(page: PDFPageProxy, scale: number): RenderHandle {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
  const viewport = page.getViewport({ scale: scale * pixelRatio })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  const task = page.render({ canvas, viewport })

  return {
    promise: task.promise.then(
      () => canvas,
      (error: unknown) => {
        if ((error as Error | undefined)?.name === 'RenderingCancelledException') return null
        throw error
      },
    ),
    cancel: () => task.cancel(),
  }
}
