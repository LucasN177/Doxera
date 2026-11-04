import type { PDFDocumentProxy } from 'pdfjs-dist'
import { create } from 'zustand'
import { closePdf, getPageSizes, openPdf, PdfLoadError } from '@/engine/render/pdfjs'
import { hasPdfSignature, looksLikePdf } from '@/lib/file'
import type { OpenDocument } from '@/types/document'

export type OpenResult = { ok: true } | { ok: false; cancelled?: boolean; message: string }

interface DocumentState {
  /** True while a file is being read and parsed. */
  loading: boolean
  document: OpenDocument | null
  /** pdf.js handle of the open document, used for rendering. */
  pdf: PDFDocumentProxy | null
  /**
   * Opens a PDF file and replaces the current document. On failure the current
   * document stays open and a user-facing message is returned.
   */
  openFile: (file: File) => Promise<OpenResult>
  /** Like {@link openFile}, for bytes that are already in memory (e.g. from the library). */
  openData: (name: string, data: Uint8Array) => Promise<OpenResult>
  close: () => void
}

/** Incremented on every open/close so stale async loads can be discarded. */
let loadToken = 0

const GENERIC_ERROR = 'Die PDF konnte nicht geöffnet werden.'
const CANCELLED: OpenResult = { ok: false, cancelled: true, message: 'Abgebrochen' }

export const useDocumentStore = create<DocumentState>()((set, get) => {
  const releaseCurrent = () => {
    const current = get().pdf
    if (current) void closePdf(current)
  }

  /** Reads, validates and parses a PDF, then makes it the open document. */
  const load = async (name: string, read: () => Promise<Uint8Array>): Promise<OpenResult> => {
    const token = ++loadToken
    const isStale = () => token !== loadToken
    set({ loading: true })

    let pdf: PDFDocumentProxy | null = null
    try {
      const data = await read()
      if (!hasPdfSignature(data)) {
        throw new PdfLoadError('invalid', `„${name}“ ist keine gültige PDF-Datei.`)
      }

      pdf = await openPdf(data)
      const pageSizes = await getPageSizes(pdf)

      if (isStale()) {
        void closePdf(pdf)
        return CANCELLED
      }

      releaseCurrent()
      set({
        loading: false,
        pdf,
        document: {
          id: crypto.randomUUID(),
          name,
          size: data.byteLength,
          data,
          pageCount: pdf.numPages,
          pageSizes,
        },
      })
      return { ok: true }
    } catch (error) {
      if (pdf) void closePdf(pdf)
      if (isStale()) return CANCELLED
      set({ loading: false })
      return { ok: false, message: error instanceof PdfLoadError ? error.message : GENERIC_ERROR }
    }
  }

  return {
    loading: false,
    document: null,
    pdf: null,

    openFile: async (file) => {
      if (!looksLikePdf(file)) {
        return { ok: false, message: `„${file.name}“ ist keine PDF-Datei.` }
      }
      return load(file.name, async () => new Uint8Array(await file.arrayBuffer()))
    },

    openData: (name, data) => load(name, async () => data),

    close: () => {
      loadToken++
      releaseCurrent()
      set({ loading: false, document: null, pdf: null })
    },
  }
})
