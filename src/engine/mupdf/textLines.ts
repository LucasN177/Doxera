import type * as Mupdf from 'mupdf'

/** A line of text as MuPDF sees it, in its page space (points, y down, page rotation applied). */
export interface RawTextLine {
  text: string
  /** Union of the glyph boxes: x0, y0, x1, y1. */
  bbox: [number, number, number, number]
  /** Baseline start of the first glyph. */
  origin: [number, number]
  /** Writing direction (unit vector). */
  direction: [number, number]
  /** Font size in points. */
  size: number
  fontName: string
  /** Fill color as RGB 0–1 (or gray). */
  color: number[]
}

export interface RawPageText {
  /** Page bounds in MuPDF page space: x0, y0, x1, y1. */
  bounds: [number, number, number, number]
  lines: RawTextLine[]
}

/** Reads all text lines of a page with their position, font and color. */
export function extractTextLines(document: Mupdf.PDFDocument, index: number): RawPageText {
  const page = document.loadPage(index)
  try {
    const bounds = page.getBounds() as [number, number, number, number]
    const text = page.toStructuredText('preserve-whitespace')
    const lines: RawTextLine[] = []
    let current: RawTextLine | null = null
    try {
      text.walk({
        beginLine(_bbox, _wmode, direction) {
          current = {
            text: '',
            bbox: [Infinity, Infinity, -Infinity, -Infinity],
            origin: [0, 0],
            direction: [direction[0], direction[1]],
            size: 0,
            fontName: '',
            color: [0, 0, 0],
          }
        },
        onChar(char, origin, font, size, quad, color) {
          const line = current
          if (!line) return
          if (!line.text) line.origin = [origin[0], origin[1]]
          line.text += char
          // Style of the first visible character
          if (!line.fontName && char.trim()) {
            line.fontName = font.getName()
            line.size = size
            line.color = [...color]
          }
          const xs = [quad[0], quad[2], quad[4], quad[6]]
          const ys = [quad[1], quad[3], quad[5], quad[7]]
          line.bbox = [
            Math.min(line.bbox[0], ...xs),
            Math.min(line.bbox[1], ...ys),
            Math.max(line.bbox[2], ...xs),
            Math.max(line.bbox[3], ...ys),
          ]
        },
        endLine() {
          const line = current
          current = null
          if (line && line.text.trim()) lines.push({ ...line, text: line.text.trimEnd() })
        },
      })
    } finally {
      text.destroy()
    }
    return { bounds, lines }
  } finally {
    page.destroy()
  }
}
