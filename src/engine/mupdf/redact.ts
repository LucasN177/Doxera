import type * as Mupdf from 'mupdf'

/**
 * Applies all redaction annotations (/Subtype /Redact) of a PDF for good:
 * text, image pixels and line art below them are removed from the page
 * content and a black box is drawn in their place. The file is written anew
 * (not as an incremental update), so no removed content stays in it.
 */
export function applyRedactions(mupdf: typeof Mupdf, data: Uint8Array): Uint8Array {
  const document = new mupdf.PDFDocument(data)
  try {
    for (let index = 0; index < document.countPages(); index++) {
      const page = document.loadPage(index)
      try {
        const redactions = page.getAnnotations().filter((item) => item.getType() === 'Redact')
        if (redactions.length === 0) continue
        page.applyRedactions(
          true,
          mupdf.PDFPage.REDACT_IMAGE_PIXELS,
          mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
          mupdf.PDFPage.REDACT_TEXT_REMOVE,
        )
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
