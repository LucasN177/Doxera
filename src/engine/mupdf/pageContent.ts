import type * as Mupdf from 'mupdf'

type Matrix6 = [number, number, number, number, number, number]
type Rect4 = [number, number, number, number]

/** A line of text as MuPDF sees it, in its page space (points, y down, page rotation applied). */
export interface RawTextLine {
  text: string
  /** Union of the glyph boxes: x0, y0, x1, y1. */
  bbox: Rect4
  /** Baseline start of the first glyph. */
  origin: [number, number]
  /** Writing direction (unit vector). */
  direction: [number, number]
  /** Font size in points. */
  size: number
  fontName: string
  /** Fill color as RGB 0–1 (or gray / CMYK). */
  color: number[]
}

/** An image drawn on the page, in MuPDF page space. */
export interface RawImage {
  /** Position among the page's image blocks (to fetch its pixels later). */
  index: number
  bbox: Rect4
  /** Maps the unit square of the image (y down) to the page. */
  transform: Matrix6
  width: number
  height: number
  /**
   * Name of the image XObject in the page resources that draws it, if it can
   * be identified for sure (drawn directly by the page, exactly once).
   * Without it the image can't be replaced.
   */
  xobject: string | null
}

export interface RawPageText {
  /** Page bounds in MuPDF page space: x0, y0, x1, y1. */
  bounds: Rect4
  lines: RawTextLine[]
  images: RawImage[]
}

interface ImageBlock {
  bbox: Rect4
  transform: Matrix6
  width: number
  height: number
  mask: boolean
}

/** Decoded page content (all content streams joined). */
function pageContentText(page: Mupdf.PDFPage): string {
  const read = (object: Mupdf.PDFObject): string => {
    const resolved = object.resolve()
    if (resolved.isArray()) {
      return Array.from({ length: resolved.length }, (_, i) => read(resolved.get(i))).join('\n')
    }
    // isStream() is false for resolved stream objects; reading tells
    try {
      return object.readStream().asString()
    } catch {
      return ''
    }
  }
  return read(page.getObject().get('Contents'))
}

/** Image XObjects of the page resources: name → pixel size. */
function imageXObjects(page: Mupdf.PDFPage): Map<string, { width: number; height: number }> {
  const result = new Map<string, { width: number; height: number }>()
  const xobjects = page.getObject().getInheritable('Resources').get('XObject')
  if (!xobjects.isDictionary()) return result
  xobjects.forEach((value, key) => {
    const object = value.resolve()
    if (object.get('Subtype').isName() && object.get('Subtype').asName() === 'Image') {
      result.set(String(key), {
        width: object.get('Width').asNumber(),
        height: object.get('Height').asNumber(),
      })
    }
  })
  return result
}

/**
 * Matches image blocks to the image XObjects the page content draws with
 * `/Name Do`. When the page draws exactly the reported images in order, they
 * match by position; otherwise only images whose pixel size is unique.
 */
function matchXObjects(page: Mupdf.PDFPage, blocks: readonly ImageBlock[]): (string | null)[] {
  let images: Map<string, { width: number; height: number }>
  let content: string
  try {
    images = imageXObjects(page)
    content = pageContentText(page)
  } catch {
    return blocks.map(() => null)
  }
  const drawn = [...content.matchAll(/\/([^\s/<>[\]()]+)\s+Do\b/g)]
    .map((match) => match[1])
    .filter((name) => images.has(name))
  const uses = new Map<string, number>()
  for (const name of drawn) uses.set(name, (uses.get(name) ?? 0) + 1)
  const usable = (name: string, block: ImageBlock) => {
    const size = images.get(name)
    return uses.get(name) === 1 && size?.width === block.width && size.height === block.height
  }

  if (drawn.length === blocks.length && blocks.every((block, i) => usable(drawn[i], block))) {
    return [...drawn]
  }
  return blocks.map((block) => {
    const candidates = [...uses.keys()].filter((name) => {
      const size = images.get(name)
      return size?.width === block.width && size.height === block.height
    })
    const sameSize = blocks.filter((b) => b.width === block.width && b.height === block.height)
    return candidates.length === 1 && sameSize.length === 1 && usable(candidates[0], block)
      ? candidates[0]
      : null
  })
}

/** Reads all text lines (position, font, color) and images of a page. */
export function extractPageContent(document: Mupdf.PDFDocument, index: number): RawPageText {
  const page = document.loadPage(index)
  try {
    const bounds = page.getBounds() as Rect4
    const text = page.toStructuredText('preserve-whitespace,preserve-images')
    const lines: RawTextLine[] = []
    const blocks: ImageBlock[] = []
    let current: RawTextLine | null = null
    try {
      text.walk({
        onImageBlock(bbox, transform, image) {
          blocks.push({
            bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
            transform: [...transform] as Matrix6,
            width: image.getWidth(),
            height: image.getHeight(),
            mask: image.getImageMask(),
          })
        },
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

    const names = matchXObjects(page, blocks)
    const images: RawImage[] = blocks.flatMap((block, i) =>
      block.mask
        ? []
        : [
            {
              index: i,
              bbox: block.bbox,
              transform: block.transform,
              width: block.width,
              height: block.height,
              xobject: names[i],
            },
          ],
    )
    return { bounds, lines, images }
  } finally {
    page.destroy()
  }
}

export interface ImagePixels {
  mimeType: 'image/png' | 'image/jpeg'
  data: Uint8Array
  width: number
  height: number
}

/**
 * Pixels of an image block of a page as PNG (keeps transparency) or, for
 * large opaque images, as JPEG.
 */
export function extractImage(
  mupdf: typeof Mupdf,
  document: Mupdf.PDFDocument,
  pageIndex: number,
  imageIndex: number,
): ImagePixels {
  const page = document.loadPage(pageIndex)
  try {
    const text = page.toStructuredText('preserve-images')
    let found: Mupdf.Pixmap | null = null
    let count = 0
    try {
      text.walk({
        onImageBlock(_bbox, _transform, image) {
          if (count++ === imageIndex && !found) found = image.toPixmap()
        },
      })
    } finally {
      text.destroy()
    }
    let pixmap = found as Mupdf.Pixmap | null
    if (!pixmap) throw new Error(`Bild ${imageIndex} auf Seite ${pageIndex + 1} nicht gefunden.`)
    // CMYK, Lab, indexed …: convert to RGB, keeping transparency
    const space = pixmap.getColorSpace()
    if (space && !space.isRGB() && !space.isGray()) {
      const converted = pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, true)
      pixmap.destroy()
      pixmap = converted
    }
    try {
      const width = pixmap.getWidth()
      const height = pixmap.getHeight()
      const photo = !pixmap.getAlpha() && width * height > 250_000
      return photo
        ? { mimeType: 'image/jpeg', data: pixmap.asJPEG(92).slice(), width, height }
        : { mimeType: 'image/png', data: pixmap.asPNG().slice(), width, height }
    } finally {
      pixmap.destroy()
    }
  } finally {
    page.destroy()
  }
}
