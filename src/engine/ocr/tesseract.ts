import { t } from '@/i18n'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Worker } from 'tesseract.js'
import { MAX_CANVAS_PIXELS } from '@/engine/render/pdfjs'
import type { OcrPage } from '@/types/ocr'
import { fromTesseract, type TesseractPage } from './result'

/** Languages whose recognition data ships with Doxera (no download from elsewhere). */
export const OCR_LANGUAGES = [
  { code: 'deu', name: t('Deutsch') },
  { code: 'eng', name: t('Englisch') },
  { code: 'fra', name: t('Französisch') },
  { code: 'spa', name: t('Spanisch') },
  { code: 'ita', name: t('Italienisch') },
] as const

export type OcrLanguage = (typeof OCR_LANGUAGES)[number]['code']

/** Resolution pages are rendered at for recognition. */
export const OCR_DPI = 300

let current: { key: string; worker: Promise<Worker> } | null = null
/** Progress of the running recognition (0–1), set per call. */
let onProgress: ((progress: number) => void) | null = null

function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}tesseract/${path}`
}

/** A Tesseract worker for the languages, reused while they stay the same. */
function getWorker(languages: readonly OcrLanguage[]): Promise<Worker> {
  const key = [...languages].sort().join('+')
  if (current?.key === key) return current.worker
  void terminateOcr()
  const worker = import('tesseract.js').then(async ({ createWorker, OEM }) => {
    const created = await createWorker([...languages], OEM.LSTM_ONLY, {
      // Everything is served by Doxera itself: nothing is fetched from a CDN
      workerPath: assetUrl('worker.min.js'),
      corePath: assetUrl(''),
      langPath: assetUrl('lang'),
      gzip: true,
      workerBlobURL: false,
      // Recognition data is cached by the service worker, not in an extra database
      cacheMethod: 'none',
      logger: (message) => {
        if (message.status === 'recognizing text') onProgress?.(message.progress)
      },
    })
    await created.setParameters({ user_defined_dpi: String(OCR_DPI) })
    return created
  })
  current = { key, worker }
  // A failed start may be retried (e.g. once back online)
  worker.catch(() => {
    if (current?.worker === worker) current = null
  })
  return worker
}

/** Loads the recognition engine and languages ahead of use (e.g. for offline use). */
export async function prepareOcr(languages: readonly OcrLanguage[]): Promise<void> {
  await getWorker(languages)
}

/** Stops the recognition worker (e.g. to cancel); the next call starts a new one. */
export async function terminateOcr() {
  const running = current
  current = null
  if (running) await running.worker.then((worker) => worker.terminate()).catch(() => {})
}

/** Renders a page (with its own rotation) at OCR resolution, within canvas limits. */
export async function renderForOcr(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 })
  const preferred = OCR_DPI / 72
  const pixels = base.width * base.height * preferred * preferred
  const scale =
    pixels <= MAX_CANVAS_PIXELS
      ? preferred
      : preferred * Math.sqrt(MAX_CANVAS_PIXELS / pixels) * 0.999
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const context = canvas.getContext('2d')!
  // Scans may have transparent areas: recognize on white
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  return canvas
}

/** Recognizes the text on a rendered page. */
export async function recognize(
  canvas: HTMLCanvasElement,
  languages: readonly OcrLanguage[],
  progress?: (progress: number) => void,
): Promise<OcrPage> {
  const worker = await getWorker(languages)
  onProgress = progress ?? null
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false })
    return fromTesseract(data as unknown as TesseractPage, canvas.width, canvas.height)
  } finally {
    onProgress = null
  }
}
