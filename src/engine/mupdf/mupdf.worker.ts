import { expose, transfer } from 'comlink'
import type { PDFDocument } from 'mupdf'
import { compressPdf, type CompressionLevel, type CompressionResult } from './compress'
import { applyRedactions, type RedactionMode } from './redact'
import { decryptPdf, encryptPdf, type DecryptResult, type ProtectOptions } from './encryption'
import { extractImage, extractPageContent, type ImagePixels, type RawPageText } from './pageContent'

// MuPDF initializes its WebAssembly with a top-level await. Importing it on
// demand lets `expose` run right away: messages arriving while a worker module
// is still evaluating would otherwise be lost.
let mupdf: Promise<typeof import('mupdf')> | null = null
const loadMupdf = () => (mupdf ??= import('mupdf'))

/** Opened source PDFs, by key, for reading text without resending the file. */
const documents = new Map<string, PDFDocument>()

async function openDocument(key: string, data?: Uint8Array): Promise<PDFDocument> {
  const lib = await loadMupdf()
  let document = documents.get(key)
  if (!document) {
    if (!data) throw new Error(`Dokument ${key} ist nicht geöffnet.`)
    document = new lib.PDFDocument(data)
    documents.set(key, document)
  }
  return document
}

/** MuPDF (WebAssembly) runs in its own worker, so the page stays responsive. */
const api = {
  async redact(data: Uint8Array, mode: RedactionMode = 'redact'): Promise<Uint8Array> {
    const result = applyRedactions(await loadMupdf(), data, mode)
    return transfer(result, [result.buffer as ArrayBuffer])
  },

  /** Makes a PDF smaller (see `compressPdf`). */
  async compress(data: Uint8Array, level: CompressionLevel): Promise<CompressionResult> {
    const result = compressPdf(await loadMupdf(), data, level)
    // The input may come back unchanged; copy so it can be transferred
    const output = result.data === data ? data.slice() : result.data
    return transfer({ ...result, data: output }, [output.buffer as ArrayBuffer])
  },

  /** Removes the encryption (see `decryptPdf`). */
  async decrypt(data: Uint8Array, password: string): Promise<DecryptResult> {
    const result = decryptPdf(await loadMupdf(), data, password)
    return result.status === 'ok' ? transfer(result, [result.data.buffer as ArrayBuffer]) : result
  },

  /** Encrypts with passwords and permissions (see `encryptPdf`). */
  async encrypt(data: Uint8Array, options: ProtectOptions): Promise<Uint8Array> {
    const result = encryptPdf(await loadMupdf(), data, options)
    return transfer(result, [result.buffer as ArrayBuffer])
  },

  /** Whether a document is open under this key (otherwise send its data). */
  hasDocument(key: string): boolean {
    return documents.has(key)
  },

  /** Text lines and images of a page; `data` is needed the first time a key is used. */
  /** Loads MuPDF (its WebAssembly gets cached by the service worker for offline use). */
  async ready(): Promise<true> {
    await loadMupdf()
    return true
  },

  async pageContent(key: string, index: number, data?: Uint8Array): Promise<RawPageText> {
    return extractPageContent(await openDocument(key, data), index, await loadMupdf())
  },

  /** Pixels of one image of a page (see `RawImage.index`). */
  async image(key: string, pageIndex: number, imageIndex: number): Promise<ImagePixels> {
    const pixels = extractImage(await loadMupdf(), await openDocument(key), pageIndex, imageIndex)
    return transfer(pixels, [pixels.data.buffer as ArrayBuffer])
  },

  /** Frees an opened document (e.g. when the file is closed). */
  closeDocument(key: string) {
    documents.get(key)?.destroy()
    documents.delete(key)
  },
}

export type MupdfWorkerApi = typeof api

expose(api)
