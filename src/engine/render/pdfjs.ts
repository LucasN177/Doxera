import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'
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
 * Largest canvas area that renders reliably everywhere. Safari on iOS/iPadOS
 * silently produces a blank canvas above 2^24 pixels (16.7 MP).
 */
export const MAX_CANVAS_PIXELS = 2 ** 24

/**
 * Render scale in device pixels for a page shown at `scale` CSS pixels per
 * point: uses the display's pixel ratio for sharpness, but reduces it if the
 * canvas would exceed {@link MAX_CANVAS_PIXELS} (the page then looks slightly
 * softer at very high zoom instead of turning blank).
 */
export function getOutputScale(
  width: number,
  height: number,
  scale: number,
  devicePixelRatio: number,
): number {
  const preferred = scale * Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO)
  const pixels = width * height * preferred * preferred
  if (pixels <= MAX_CANVAS_PIXELS) return preferred
  return preferred * Math.sqrt(MAX_CANVAS_PIXELS / pixels) * 0.999
}

/** The page's own rotation (/Rotate) plus the rotation added in the editor. */
function totalRotation(page: PDFPageProxy, extra: number): number {
  return (((page.rotate + extra) % 360) + 360) % 360
}

/**
 * Renders a page into a fresh canvas. Using a new canvas per render lets the
 * caller keep showing the previous result until the new one is ready and avoids
 * pdf.js' "same canvas in multiple render() operations" error.
 */
export function renderPage(page: PDFPageProxy, scale: number, rotation = 0): RenderHandle {
  const base = page.getViewport({ scale: 1 })
  const outputScale = getOutputScale(base.width, base.height, scale, window.devicePixelRatio)
  const viewport = page.getViewport({ scale: outputScale, rotation: totalRotation(page, rotation) })
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

// ---------------------------------------------------------------------------
// Text content & text layer
// ---------------------------------------------------------------------------

/** A run of text as extracted by pdf.js, in content-stream order. */
export interface TextRun {
  str: string
  /** The run ends a line. */
  hasEOL: boolean
}

const textContentCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<TextContent>>>()

/**
 * Text content of a page, cached per document. The text layer and the search
 * index share it, so text item indices are identical in both.
 */
export function getTextContent(pdf: PDFDocumentProxy, pageNumber: number): Promise<TextContent> {
  let pages = textContentCache.get(pdf)
  if (!pages) {
    pages = new Map()
    textContentCache.set(pdf, pages)
  }
  let content = pages.get(pageNumber)
  if (!content) {
    content = pdf.getPage(pageNumber).then((page) => page.getTextContent())
    pages.set(pageNumber, content)
  }
  return content
}

/** Text runs in the same order as the text layer's elements (marked content is skipped). */
export async function getTextRuns(pdf: PDFDocumentProxy, pageNumber: number): Promise<TextRun[]> {
  const content = await getTextContent(pdf, pageNumber)
  return content.items
    .filter((item): item is TextItem => 'str' in item)
    .map((item) => ({ str: item.str, hasEOL: item.hasEOL }))
}

export interface TextLayerHandle {
  /** One element per text run; index-aligned with {@link getTextRuns}. */
  textDivs: HTMLElement[]
  /** Text of each run. */
  runs: string[]
  /** Re-layouts the layer for a new scale (the container's --scale-factor must match). */
  update: (scale: number) => void
}

export interface TextLayerJob {
  /** Resolves when the layer is rendered, or with `null` if it was cancelled. */
  ready: Promise<TextLayerHandle | null>
  cancel: () => void
}

/**
 * Renders the transparent, selectable text layer of a page into `container`.
 * The container needs the `textLayer` class and a `--scale-factor` CSS variable.
 */
export function renderTextLayer(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  container: HTMLElement,
  scale: number,
  rotation = 0,
): TextLayerJob {
  let cancelled = false
  let cancelLayer: (() => void) | null = null

  const ready = (async () => {
    const [pdfjs, page, content] = await Promise.all([
      loadPdfJs(),
      pdf.getPage(pageNumber),
      getTextContent(pdf, pageNumber),
    ])
    if (cancelled) return null

    const layer = new pdfjs.TextLayer({
      textContentSource: content,
      container,
      viewport: page.getViewport({ scale, rotation: totalRotation(page, rotation) }),
    })
    cancelLayer = () => layer.cancel()

    try {
      await layer.render()
    } catch (error) {
      if (cancelled || (error as Error | undefined)?.name === 'AbortException') return null
      throw error
    }
    if (cancelled) return null

    // Lets selections that end below the last line work like in the pdf.js viewer
    const endOfContent = document.createElement('div')
    endOfContent.className = 'endOfContent'
    container.append(endOfContent)

    return {
      textDivs: layer.textDivs,
      runs: layer.textContentItemsStr,
      update: (nextScale: number) =>
        layer.update({
          viewport: page.getViewport({ scale: nextScale, rotation: totalRotation(page, rotation) }),
        }),
    }
  })()

  return {
    ready,
    cancel: () => {
      cancelled = true
      cancelLayer?.()
    },
  }
}

/** Renders a small preview image of a page, e.g. for the document library. */
export async function renderThumbnail(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  width: number,
): Promise<string> {
  const page = await pdf.getPage(pageNumber)
  const scale = width / page.getViewport({ scale: 1 }).width
  const canvas = await renderPage(page, scale).promise
  if (!canvas) throw new Error('Thumbnail rendering was cancelled')
  return canvas.toDataURL('image/webp', 0.8)
}
