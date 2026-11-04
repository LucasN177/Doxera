import type * as Mupdf from 'mupdf'
import { matchXObjects, type ImageBlock } from './pageContent'

export type CompressionLevel = 'lossless' | 'medium' | 'strong'

/** Target resolution and JPEG quality of images per level (lossless: images untouched). */
export const COMPRESSION_LEVELS: Record<CompressionLevel, { dpi: number; quality: number } | null> =
  {
    lossless: null,
    medium: { dpi: 150, quality: 75 },
    strong: { dpi: 96, quality: 55 },
  }

export interface CompressionResult {
  data: Uint8Array
  before: number
  after: number
  /** Images that were made smaller, of all images considered. */
  images: { recompressed: number; total: number }
}

/** Long side of an A4 page in inches: the assumed display size of images whose use is unknown. */
const PAGE_INCHES = 11.7
/** Images smaller than this (pixels on the long side) aren't worth touching. */
const MIN_PIXELS = 64
const SAVE_OPTIONS =
  'garbage=compact,compress=yes,compress-fonts=yes,compress-images=yes,objstms=yes'

/**
 * Largest size (points) each image object is drawn at on any page, by object
 * number. Images drawn inside forms can't be attributed and are missing.
 */
function displaySizes(document: Mupdf.PDFDocument): Map<number, { width: number; height: number }> {
  const sizes = new Map<number, { width: number; height: number }>()
  for (let index = 0; index < document.countPages(); index++) {
    const page = document.loadPage(index)
    try {
      const blocks: ImageBlock[] = []
      const text = page.toStructuredText('preserve-images')
      try {
        text.walk({
          onImageBlock(bbox, transform, image) {
            blocks.push({
              bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
              transform: [...transform] as ImageBlock['transform'],
              width: image.getWidth(),
              height: image.getHeight(),
              mask: image.getImageMask(),
            })
          },
        })
      } finally {
        text.destroy()
      }
      const names = matchXObjects(page, blocks)
      const xobjects = page.getObject().getInheritable('Resources').get('XObject')
      for (const [i, block] of blocks.entries()) {
        const name = names[i]
        if (!name || !xobjects.isDictionary()) continue
        const reference = xobjects.get(name)
        if (!reference.isIndirect()) continue
        const number = reference.asIndirect()
        // Length of the image's own axes on the page, whatever its rotation
        const [a, b, c, d] = block.transform
        const known = sizes.get(number)
        sizes.set(number, {
          width: Math.max(known?.width ?? 0, Math.hypot(a, b)),
          height: Math.max(known?.height ?? 0, Math.hypot(c, d)),
        })
      }
    } finally {
      page.destroy()
    }
  }
  return sizes
}

/** Object numbers of images used as soft masks (transparency) of other images. */
function softMasks(document: Mupdf.PDFDocument): Set<number> {
  const masks = new Set<number>()
  for (let number = 1; number < document.countObjects(); number++) {
    const object = document.newIndirect(number).resolve()
    if (!object.isDictionary()) continue
    const mask = object.get('SMask')
    if (mask.isIndirect()) masks.add(mask.asIndirect())
  }
  return masks
}

/**
 * Makes a PDF smaller: images are scaled down to the target resolution for
 * the size they are shown at and stored as JPEG (only where that is smaller),
 * fonts are reduced to the used characters, and the file is rewritten with
 * compressed streams, object streams and without unused objects.
 * "lossless" keeps images and fonts as they are and only rewrites the file.
 */
export function compressPdf(
  mupdf: typeof Mupdf,
  data: Uint8Array,
  level: CompressionLevel,
): CompressionResult {
  const settings = COMPRESSION_LEVELS[level]
  const document = new mupdf.PDFDocument(data)
  const images = { recompressed: 0, total: 0 }
  try {
    if (settings) {
      const sizes = displaySizes(document)
      const masks = softMasks(document)
      const count = document.countObjects()
      for (let number = 1; number < count; number++) {
        if (masks.has(number)) continue
        const reference = document.newIndirect(number)
        const object = reference.resolve()
        if (!object.isDictionary()) continue
        const subtype = object.get('Subtype')
        if (!subtype.isName() || subtype.asName() !== 'Image') continue
        // Stencil masks and 1-bit scans (CCITT / JBIG2) are small already
        const stencil = object.get('ImageMask')
        if (stencil.isBoolean() && stencil.asBoolean()) continue
        const bits = object.get('BitsPerComponent')
        if (bits.isNumber() && bits.asNumber() < 8) continue
        const width = object.get('Width').asNumber()
        const height = object.get('Height').asNumber()
        if (Math.max(width, height) < MIN_PIXELS) continue
        images.total++

        const shown = sizes.get(number)
        const scale = shown
          ? Math.min(
              1,
              Math.max(
                ((shown.width / 72) * settings.dpi) / width,
                ((shown.height / 72) * settings.dpi) / height,
              ),
            )
          : Math.min(1, (settings.dpi * PAGE_INCHES) / Math.max(width, height))
        const filter = object.get('Filter')
        const isJpeg = filter.isName() && filter.asName() === 'DCTDecode'
        // A JPEG at about the right size already: leave it
        if (isJpeg && scale > 0.9) continue

        // Only the length is needed. Read it right away: MuPDF returns a view into its
        // WebAssembly memory, which becomes invalid once that memory grows.
        let originalLength: number
        try {
          const raw = reference.readRawStream()
          originalLength = raw.asUint8Array().length
          raw.destroy()
        } catch {
          continue
        }
        let image: Mupdf.Image | null = null
        let pixmap: Mupdf.Pixmap | null = null
        try {
          image = document.loadImage(reference)
          pixmap = image.toPixmap()
          const space = pixmap.getColorSpace()
          if (pixmap.getAlpha() || !space || (!space.isRGB() && !space.isGray())) {
            const converted = pixmap.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false)
            pixmap.destroy()
            pixmap = converted
          }
          if (scale < 1) {
            const w = pixmap.getWidth()
            const h = pixmap.getHeight()
            const scaled = pixmap.warp(
              [
                [0, 0],
                [w, 0],
                [w, h],
                [0, h],
              ],
              Math.max(1, Math.round(w * scale)),
              Math.max(1, Math.round(h * scale)),
            )
            pixmap.destroy()
            pixmap = scaled
          }
          const jpeg = pixmap.asJPEG(settings.quality).slice()
          if (jpeg.length >= originalLength * 0.9) continue

          // Replace the image object in place: every use of it gets the new version
          const replacement = document.addImage(new mupdf.Image(jpeg))
          const smask = object.get('SMask')
          reference.writeObject(replacement.resolve())
          reference.writeRawStream(jpeg)
          if (smask.isIndirect()) reference.put('SMask', smask)
          images.recompressed++
        } catch {
          // Images MuPDF can't decode stay as they are
        } finally {
          pixmap?.destroy()
          image?.destroy()
        }
      }

      try {
        document.subsetFonts()
      } catch {
        // Keep the full fonts if subsetting fails
      }
    }

    const buffer = document.saveToBuffer(SAVE_OPTIONS)
    let output: Uint8Array
    try {
      output = buffer.asUint8Array().slice()
    } finally {
      buffer.destroy()
    }
    // Never hand out a larger file
    const result = output.length < data.length ? output : data
    return { data: result, before: data.length, after: result.length, images }
  } finally {
    document.destroy()
  }
}
