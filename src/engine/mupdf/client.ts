import type { Remote } from 'comlink'
import type { MupdfWorkerApi } from './mupdf.worker'

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
export async function redactPdf(data: Uint8Array): Promise<Uint8Array> {
  const { api, failed } = await connect()
  return Promise.race([api.redact(data), failed])
}
