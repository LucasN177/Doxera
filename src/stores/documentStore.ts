import type { PDFDocumentProxy } from 'pdfjs-dist'
import { create } from 'zustand'
import { insertPages, pagesFromSource } from '@/engine/document/pageOps'
import { closePdf, getPageSizes, openPdf, PdfLoadError } from '@/engine/render/pdfjs'
import { hasPdfSignature, looksLikePdf } from '@/lib/file'
import type { ImageAsset } from '@/types/annotations'
import type { OpenDocument, PageRef, PdfSource } from '@/types/document'

export type OpenResult = { ok: true } | { ok: false; cancelled?: boolean; message: string }

export interface InsertResult {
  /** Number of inserted pages. */
  pages: number
  /** User-facing messages for files that could not be inserted. */
  errors: string[]
}

/** Maximum number of undo steps kept in memory. */
export const MAX_HISTORY = 100

interface History {
  past: PageRef[][]
  future: PageRef[][]
}

interface DocumentState {
  /** True while a file is being read and parsed. */
  loading: boolean
  document: OpenDocument | null
  /** All loaded PDFs the document's pages come from, by source id. */
  sources: ReadonlyMap<string, PdfSource>
  /** pdf.js handle of the opened file (the primary source). */
  pdf: PDFDocumentProxy | null
  /** Images used by image annotations (pictures, signatures). */
  assets: ReadonlyMap<string, ImageAsset>
  history: History

  /**
   * Opens a PDF file and replaces the current document. On failure the current
   * document stays open and a user-facing message is returned.
   */
  openFile: (file: File) => Promise<OpenResult>
  /** Like {@link openFile}, for bytes that are already in memory (e.g. from the library). */
  openData: (name: string, data: Uint8Array) => Promise<OpenResult>
  close: () => void

  /**
   * Applies a change to the page list as one undoable step. Returns false (and
   * changes nothing) if the result would have no pages.
   */
  edit: (change: (pages: PageRef[]) => PageRef[]) => boolean
  undo: () => void
  redo: () => void
  /** Registers an image for image annotations (not an undo step; assets stay for the session). */
  addAsset: (asset: Omit<ImageAsset, 'url'>) => ImageAsset
  /** Adds the pages of other PDF files at `index` (one undoable step). */
  insertFiles: (files: File[], index: number) => Promise<InsertResult>
}

/** Incremented on every open/close so stale async loads can be discarded. */
let loadToken = 0

const GENERIC_ERROR = 'Die PDF konnte nicht geöffnet werden.'
const CANCELLED: OpenResult = { ok: false, cancelled: true, message: 'Abgebrochen' }
const EMPTY_HISTORY: History = { past: [], future: [] }

/** Validates and parses a PDF. Throws {@link PdfLoadError} with a user-facing message. */
async function loadSource(name: string, data: Uint8Array): Promise<PdfSource> {
  if (!hasPdfSignature(data)) {
    throw new PdfLoadError('invalid', `„${name}“ ist keine gültige PDF-Datei.`)
  }
  const pdf = await openPdf(data)
  try {
    const pageSizes = await getPageSizes(pdf)
    return { id: crypto.randomUUID(), name, data, pdf, pageSizes }
  } catch (error) {
    void closePdf(pdf)
    throw error
  }
}

function errorMessage(error: unknown): string {
  return error instanceof PdfLoadError ? error.message : GENERIC_ERROR
}

export const useDocumentStore = create<DocumentState>()((set, get) => {
  const releaseAll = () => {
    const ids = [...get().sources.keys()]
    for (const source of get().sources.values()) void closePdf(source.pdf)
    // Sources opened in the MuPDF worker for text editing (no-op if it never ran)
    if (ids.length > 0) {
      void import('@/engine/mupdf/client').then(({ closeTextSource }) =>
        Promise.all(ids.map(closeTextSource)),
      )
    }
    for (const asset of get().assets.values()) URL.revokeObjectURL(asset.url)
  }

  /** Reads, validates and parses a PDF, then makes it the open document. */
  const load = async (name: string, read: () => Promise<Uint8Array>): Promise<OpenResult> => {
    const token = ++loadToken
    const isStale = () => token !== loadToken
    set({ loading: true })

    let source: PdfSource | null = null
    try {
      const data = await read()
      source = await loadSource(name, data)

      if (isStale()) {
        void closePdf(source.pdf)
        return CANCELLED
      }

      releaseAll()
      set({
        loading: false,
        pdf: source.pdf,
        sources: new Map([[source.id, source]]),
        assets: new Map(),
        history: EMPTY_HISTORY,
        document: {
          id: crypto.randomUUID(),
          name,
          size: data.byteLength,
          data,
          primarySourceId: source.id,
          pages: pagesFromSource(source),
        },
      })
      return { ok: true }
    } catch (error) {
      if (source) void closePdf(source.pdf)
      if (isStale()) return CANCELLED
      set({ loading: false })
      return { ok: false, message: errorMessage(error) }
    }
  }

  const setPages = (pages: PageRef[], history: History) => {
    const document = get().document
    if (document) set({ document: { ...document, pages }, history })
  }

  return {
    loading: false,
    document: null,
    sources: new Map(),
    pdf: null,
    assets: new Map(),
    history: EMPTY_HISTORY,

    openFile: async (file) => {
      if (!looksLikePdf(file)) {
        return { ok: false, message: `„${file.name}“ ist keine PDF-Datei.` }
      }
      return load(file.name, async () => new Uint8Array(await file.arrayBuffer()))
    },

    openData: (name, data) => load(name, async () => data),

    close: () => {
      loadToken++
      releaseAll()
      set({
        loading: false,
        document: null,
        pdf: null,
        sources: new Map(),
        assets: new Map(),
        history: EMPTY_HISTORY,
      })
    },

    edit: (change) => {
      const { document, history } = get()
      if (!document) return false
      const next = change(document.pages)
      if (next.length === 0) return false
      const unchanged =
        next.length === document.pages.length &&
        next.every((page, index) => page === document.pages[index])
      if (unchanged) return true
      setPages(next, {
        past: [...history.past, document.pages].slice(-MAX_HISTORY),
        future: [],
      })
      return true
    },

    undo: () => {
      const { document, history } = get()
      const previous = history.past.at(-1)
      if (!document || !previous) return
      setPages(previous, {
        past: history.past.slice(0, -1),
        future: [document.pages, ...history.future],
      })
    },

    redo: () => {
      const { document, history } = get()
      const [next, ...future] = history.future
      if (!document || !next) return
      setPages(next, { past: [...history.past, document.pages], future })
    },

    addAsset: (input) => {
      const url = URL.createObjectURL(new Blob([input.data.slice()], { type: input.mimeType }))
      const asset: ImageAsset = { ...input, url }
      set({ assets: new Map(get().assets).set(asset.id, asset) })
      return asset
    },

    insertFiles: async (files, index) => {
      const documentId = get().document?.id
      if (!documentId) return { pages: 0, errors: [] }

      const loaded: PdfSource[] = []
      const errors: string[] = []
      for (const file of files) {
        if (!looksLikePdf(file)) {
          errors.push(`„${file.name}“ ist keine PDF-Datei.`)
          continue
        }
        try {
          loaded.push(await loadSource(file.name, new Uint8Array(await file.arrayBuffer())))
        } catch (error) {
          errors.push(errorMessage(error))
        }
      }

      // The document was closed or replaced meanwhile
      if (get().document?.id !== documentId) {
        for (const source of loaded) void closePdf(source.pdf)
        return { pages: 0, errors: [] }
      }
      if (loaded.length === 0) return { pages: 0, errors }

      const sources = new Map(get().sources)
      for (const source of loaded) sources.set(source.id, source)
      set({ sources })

      const inserted = loaded.flatMap(pagesFromSource)
      get().edit((pages) => insertPages(pages, inserted, index))
      return { pages: inserted.length, errors }
    },
  }
})

/** The opened file's source. */
export function getPrimarySource(state: Pick<DocumentState, 'document' | 'sources'>) {
  return state.document ? state.sources.get(state.document.primarySourceId) : undefined
}
