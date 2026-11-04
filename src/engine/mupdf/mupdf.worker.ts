import { expose, transfer } from 'comlink'
import type { PDFDocument } from 'mupdf'
import { applyRedactions, type RedactionMode } from './redact'
import { extractTextLines, type RawPageText } from './textLines'

// MuPDF initializes its WebAssembly with a top-level await. Importing it on
// demand lets `expose` run right away: messages arriving while a worker module
// is still evaluating would otherwise be lost.
let mupdf: Promise<typeof import('mupdf')> | null = null
const loadMupdf = () => (mupdf ??= import('mupdf'))

/** Opened source PDFs, by key, for reading text without resending the file. */
const documents = new Map<string, PDFDocument>()

/** MuPDF (WebAssembly) runs in its own worker, so the page stays responsive. */
const api = {
  async redact(data: Uint8Array, mode: RedactionMode = 'redact'): Promise<Uint8Array> {
    const result = applyRedactions(await loadMupdf(), data, mode)
    return transfer(result, [result.buffer as ArrayBuffer])
  },

  /** Whether a document is open under this key (otherwise send its data). */
  hasDocument(key: string): boolean {
    return documents.has(key)
  },

  /** Text lines of a page; `data` is needed the first time a key is used. */
  async textLines(key: string, index: number, data?: Uint8Array): Promise<RawPageText> {
    const lib = await loadMupdf()
    let document = documents.get(key)
    if (!document) {
      if (!data) throw new Error(`Dokument ${key} ist nicht geöffnet.`)
      document = new lib.PDFDocument(data)
      documents.set(key, document)
    }
    return extractTextLines(document, index)
  },

  /** Frees an opened document (e.g. when the file is closed). */
  closeDocument(key: string) {
    documents.get(key)?.destroy()
    documents.delete(key)
  },
}

export type MupdfWorkerApi = typeof api

expose(api)
