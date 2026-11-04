import type { PDFDocumentProxy } from 'pdfjs-dist'

/** Unscaled page size in PDF points (1/72 inch), with page rotation applied. */
export interface PageSize {
  width: number
  height: number
}

export type Rotation = 0 | 90 | 180 | 270

/** A loaded PDF file whose pages can appear in the document (the opened file or an inserted one). */
export interface PdfSource {
  id: string
  name: string
  data: Uint8Array
  pdf: PDFDocumentProxy
  /** Size of every page as stored in the file (its own /Rotate applied). */
  pageSizes: PageSize[]
}

/**
 * One page of the edited document. Pages are references into sources, so
 * reordering, rotating, duplicating or deleting never touches the PDF data.
 */
export interface PageRef {
  /** Stable id of this page in the document (survives reordering). */
  id: string
  sourceId: string
  /** Zero-based page index within the source. */
  sourceIndex: number
  /** Rotation added on top of the page's own rotation. */
  rotation: Rotation
}

/** The document opened in the editor. */
export interface OpenDocument {
  id: string
  name: string
  /** Size of the original file in bytes. */
  size: number
  /** Original, unmodified file contents. */
  data: Uint8Array
  /** Source of the opened file. */
  primarySourceId: string
  pages: PageRef[]
}

/** A page resolved for rendering. */
export interface ResolvedPage {
  ref: PageRef
  pdf: PDFDocumentProxy
  /** 1-based page number within the source, as pdf.js expects it. */
  pageNumber: number
  /** Displayed size with all rotation applied. */
  size: PageSize
}
