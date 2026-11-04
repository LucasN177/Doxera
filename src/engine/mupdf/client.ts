import type { Remote } from 'comlink'
import type { MupdfWorkerApi } from './mupdf.worker'
import type { RedactionMode } from './redact'
import type { ImagePixels, RawPageText } from './pageContent'

interface Connection {
  api: Remote<MupdfWorkerApi>
  /** Rejects when the worker fails (e.g. MuPDF could not be loaded). */
  failed: Promise<never>
}

let connection: Promise<Connection> | null = null

/** Starts the MuPDF worker on first use; MuPDF (~10 MB WebAssembly) is only loaded then. */
function connect(): Promise<Connection> {
  connection ??= import('comlink').then(({ wrap }) => {
    const worker = new Worker(new URL('./mupdf.worker.ts', import.meta.url), {
      type: 'module',
      name: 'mupdf',
    })
    const failed = new Promise<never>((_, reject) => {
      worker.addEventListener('error', (event) => {
        // Start over next time (e.g. once the device is back online)
        connection = null
        worker.terminate()
        reject(new Error(`MuPDF konnte nicht geladen werden: ${event.message || 'Worker-Fehler'}`))
      })
    })
    failed.catch(() => {}) // handled where it is awaited
    return { api: wrap<MupdfWorkerApi>(worker), failed }
  })
  return connection
}

/** Applies all redaction annotations of a PDF for good (see `applyRedactions`). */
export async function redactPdf(
  data: Uint8Array,
  mode: RedactionMode = 'redact',
): Promise<Uint8Array> {
  const { api, failed } = await connect()
  return Promise.race([api.redact(data, mode), failed])
}

/**
 * Text lines and images of a page of a source PDF. The file is sent to the
 * worker only the first time a source is used.
 */
export async function readPageContent(
  source: { id: string; data: Uint8Array },
  index: number,
): Promise<RawPageText> {
  const { api, failed } = await connect()
  const read = async () => {
    // The worker copies the data; the source keeps its own bytes
    const data = (await api.hasDocument(source.id)) ? undefined : source.data.slice()
    return api.pageContent(source.id, index, data)
  }
  return Promise.race([read(), failed])
}

/** Pixels of an image of a source page (after `readPageContent` for that source). */
export async function readImage(
  sourceId: string,
  pageIndex: number,
  imageIndex: number,
): Promise<ImagePixels> {
  const { api, failed } = await connect()
  return Promise.race([api.image(sourceId, pageIndex, imageIndex), failed])
}

/** Frees a source in the worker, if it was opened there. */
export async function closeTextSource(id: string) {
  if (!connection) return
  const { api } = await connection
  await api.closeDocument(id)
}
