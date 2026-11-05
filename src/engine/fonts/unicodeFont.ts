import type { PDFDocument, PDFFont } from 'pdf-lib'

/** Characters of WinAnsi (the standard PDF fonts' encoding) between 0x80 and 0x9F. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')

/**
 * Whether a text has characters the 14 standard PDF fonts can't show
 * (e.g. Polish, Czech, Turkish, Greek or Cyrillic letters, or "≤").
 */
export function needsUnicode(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code === 9 || code === 10 || code === 13) continue
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) continue
    if (WIN_ANSI_EXTRA.has(char)) continue
    return true
  }
  return false
}

export type UnicodeStyle = 'Regular' | 'Bold' | 'Italic' | 'BoldItalic'

export function unicodeStyle(bold = false, italic = false): UnicodeStyle {
  return bold ? (italic ? 'BoldItalic' : 'Bold') : italic ? 'Italic' : 'Regular'
}

/** Key of the Unicode font in the text font maps of the export. */
export const unicodeFontKey = (style: UnicodeStyle) => `doxera:unicode-${style}`

type FontSource = (style: UnicodeStyle) => Promise<Uint8Array>

/**
 * Liberation Sans (Latin, Greek, Cyrillic; metrics like Helvetica). It ships
 * with pdf.js and is part of the offline cache.
 */
let source: FontSource = async (style) => {
  const response = await fetch(
    `${import.meta.env.BASE_URL}pdfjs/standard_fonts/LiberationSans-${style}.ttf`,
  )
  if (!response.ok) throw new Error(`Schrift konnte nicht geladen werden (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}
const cache = new Map<UnicodeStyle, Promise<Uint8Array>>()

/** Replaces where the font files come from (tests read them from disk). */
export function setUnicodeFontSource(next: FontSource) {
  source = next
  cache.clear()
}

function fontBytes(style: UnicodeStyle): Promise<Uint8Array> {
  let bytes = cache.get(style)
  if (!bytes) {
    bytes = source(style)
    bytes.catch(() => cache.delete(style))
    cache.set(style, bytes)
  }
  return bytes
}

const fontkitRegistered = new WeakSet<PDFDocument>()

/** Embeds the Unicode font into a PDF (only the used glyphs). */
export async function embedUnicodeFont(
  document: PDFDocument,
  style: UnicodeStyle = 'Regular',
): Promise<PDFFont> {
  if (!fontkitRegistered.has(document)) {
    const { default: fontkit } = await import('@pdf-lib/fontkit')
    document.registerFontkit(fontkit)
    fontkitRegistered.add(document)
  }
  return document.embedFont(await fontBytes(style), { subset: true })
}
