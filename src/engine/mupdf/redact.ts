import type * as Mupdf from 'mupdf'

/**
 * - `redact`: everything below the areas is removed (text, image pixels,
 *   fully covered line art) and a black box is drawn in their place.
 * - `text`: only the text below is removed, nothing is drawn (used to
 *   replace existing text with edited text).
 */
export type RedactionMode = 'redact' | 'text'

/**
 * Applies all redaction annotations (/Subtype /Redact) of a PDF for good. The
 * file is written anew (not as an incremental update), so no removed content
 * stays in it.
 */
export function applyRedactions(
  mupdf: typeof Mupdf,
  data: Uint8Array,
  mode: RedactionMode = 'redact',
): Uint8Array {
  const { PDFPage } = mupdf
  const document = new mupdf.PDFDocument(data)
  try {
    for (let index = 0; index < document.countPages(); index++) {
      const page = document.loadPage(index)
      try {
        const redactions = page.getAnnotations().filter((item) => item.getType() === 'Redact')
        if (redactions.length === 0) continue
        if (mode === 'redact') {
          page.applyRedactions(
            true,
            PDFPage.REDACT_IMAGE_PIXELS,
            PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
            PDFPage.REDACT_TEXT_REMOVE,
          )
        } else {
          page.applyRedactions(
            false,
            PDFPage.REDACT_IMAGE_NONE,
            PDFPage.REDACT_LINE_ART_NONE,
            PDFPage.REDACT_TEXT_REMOVE,
          )
        }
      } finally {
        page.destroy()
      }
    }
    // garbage: drop objects that are no longer referenced (e.g. removed images)
    const buffer = document.saveToBuffer('garbage=compact,compress=yes')
    try {
      return buffer.asUint8Array().slice()
    } finally {
      buffer.destroy()
    }
  } finally {
    document.destroy()
  }
}
