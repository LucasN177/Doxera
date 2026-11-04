/** Unscaled page size in PDF points (1/72 inch), with page rotation applied. */
export interface PageSize {
  width: number
  height: number
}

/** A PDF document opened in the editor. */
export interface OpenDocument {
  id: string
  name: string
  /** File size in bytes. */
  size: number
  /** Original, unmodified file contents. */
  data: Uint8Array
  pageCount: number
  pageSizes: PageSize[]
}
