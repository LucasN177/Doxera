import type { OcrLanguage } from '@/engine/ocr/tesseract'

/** Languages loaded for offline text recognition (Doxera's defaults). */
export const OFFLINE_LANGUAGES: readonly OcrLanguage[] = ['deu', 'eng']

/** Approximate download for {@link prepareOffline}, for the user-facing hint. */
export const OFFLINE_DOWNLOAD_MB = 19

/**
 * Whether the parts that are only cached on first use are there: MuPDF
 * (editing text and images, redacting, compressing, passwords) and text
 * recognition with the default languages.
 */
export async function isOfflineReady(): Promise<boolean> {
  if (typeof caches === 'undefined') return false
  try {
    const names = await caches.keys()
    const has = async (prefix: string, pattern: RegExp) => {
      for (const name of names.filter((item) => item.startsWith(prefix))) {
        const keys = await (await caches.open(name)).keys()
        if (keys.some((request) => pattern.test(request.url))) return true
      }
      return false
    }
    const checks = await Promise.all([
      has('doxera-mupdf', /mupdf-wasm-[\w-]+\.wasm$/),
      has('doxera-tesseract', /tesseract-core[\w-]*\.wasm\.js$/),
      ...OFFLINE_LANGUAGES.map((code) =>
        has('doxera-tesseract', new RegExp(`/lang/${code}\\.traineddata`)),
      ),
    ])
    return checks.every(Boolean)
  } catch {
    return false
  }
}

let running: Promise<void> | null = null

/**
 * Loads MuPDF and the recognition data once, so every feature also works
 * without a network. The service worker keeps the files (runtime caching).
 */
export function prepareOffline(): Promise<void> {
  running ??= (async () => {
    const [{ loadMupdf }, { prepareOcr }] = await Promise.all([
      import('@/engine/mupdf/client'),
      import('@/engine/ocr/tesseract'),
    ])
    await Promise.all([loadMupdf(), prepareOcr(OFFLINE_LANGUAGES)])
  })().finally(() => {
    running = null
  })
  return running
}

/** Whether Doxera runs as an installed app (home screen, desktop app). */
export function isInstalledApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
