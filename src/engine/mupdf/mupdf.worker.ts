import { expose, transfer } from 'comlink'
import { applyRedactions } from './redact'

// MuPDF initializes its WebAssembly with a top-level await. Importing it on
// demand lets `expose` run right away: messages arriving while a worker module
// is still evaluating would otherwise be lost.
let mupdf: Promise<typeof import('mupdf')> | null = null
const loadMupdf = () => (mupdf ??= import('mupdf'))

/** MuPDF (WebAssembly) runs in its own worker, so the page stays responsive. */
const api = {
  async redact(data: Uint8Array): Promise<Uint8Array> {
    const result = applyRedactions(await loadMupdf(), data)
    return transfer(result, [result.buffer as ArrayBuffer])
  },
}

export type MupdfWorkerApi = typeof api

expose(api)
