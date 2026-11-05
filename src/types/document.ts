import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Annotation } from './annotations'

/** Unscaled page size in PDF points (1/72 inch), with page rotation applied. */
export interface PageSize {
  width: number
  height: number
  /** The page's own rotation (/Rotate) in degrees, if known. */
  rotate?: number
}

/**
 * Crop margins as fractions (0–1) of the uncropped page, measured in the page's
 * unrotated coordinate space, so they rotate together with the page.
 */
export interface CropInsets {
  top: number
  right: number
  bottom: number
  left: number
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
  /** Visible part of the page; omitted when uncropped. */
  crop?: CropInsets
  /** Shapes, lines and texts drawn on the page. */
  annotations?: Annotation[]
}

/** The document opened in the editor. */
export interface OpenDocument {
  id: string
  name: string
  /** Size of the original file in bytes. */
  size: number
  /** Original, unmodified file contents (decrypted if the file was protected). */
  data: Uint8Array
  /** The file as it was, if it had to be decrypted (kept in the library instead of `data`). */
  originalData?: Uint8Array
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
  /** Displayed size with all rotation and the crop applied. */
  size: PageSize
  /** Displayed size of the whole page before cropping. */
  fullSize: PageSize
  /** Crop margins in displayed (rotated) orientation; all zero when uncropped. */
  crop: CropInsets
  /** Clockwise quarter turns the page is displayed with (own + added rotation). */
  turns: number
}
