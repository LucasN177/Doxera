import type { PreparedImage } from '@/lib/images'
import { t } from '@/i18n'

export type PageFormat = 'a4' | 'letter' | 'image'

export interface ImagesToPdfOptions {
  /** Page size; A4 and Letter turn to landscape for wide images. */
  format: PageFormat
  /** Space around the image in points (A4 / Letter only). */
  margin: number
  title?: string
}

/** Paper sizes in points (portrait). */
export const PAPER_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const

/** Pixels per point for "page = image size" (96 dpi screen pixels). */
const PIXELS_PER_POINT = 96 / 72
/** PDF pages can't be larger than 200 inches. */
const MAX_PAGE = 14_400

/** Page size and image placement for one image. */
export function imagePageLayout(
  image: Pick<PreparedImage, 'width' | 'height'>,
  { format, margin }: Pick<ImagesToPdfOptions, 'format' | 'margin'>,
) {
  const aspect = image.width / Math.max(1, image.height)
  if (format === 'image') {
    let width = image.width / PIXELS_PER_POINT
    let height = image.height / PIXELS_PER_POINT
    const scale = Math.min(1, MAX_PAGE / Math.max(width, height))
    width *= scale
    height *= scale
    return { page: { width, height }, image: { x: 0, y: 0, width, height } }
  }
  const paper = PAPER_SIZES[format]
  const landscape = aspect > 1
  const page = landscape
    ? { width: paper.height, height: paper.width }
    : { width: paper.width, height: paper.height }
  const maxWidth = page.width - 2 * margin
  const maxHeight = page.height - 2 * margin
  // Fit inside the margins, keeping the proportions, centered
  const width = Math.min(maxWidth, maxHeight * aspect)
  const height = width / aspect
  return {
    page,
    image: { x: (page.width - width) / 2, y: (page.height - height) / 2, width, height },
  }
}

/** Builds a PDF with one page per image (PNG or JPEG data, see `prepareImage`). */
export async function imagesToPdf(
  images: readonly PreparedImage[],
  options: ImagesToPdfOptions,
): Promise<Uint8Array> {
  if (images.length === 0) throw new Error(t('Keine Bilder ausgewählt.'))
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()
  for (const image of images) {
    const embedded =
      image.mimeType === 'image/png'
        ? await output.embedPng(image.data)
        : await output.embedJpg(image.data)
    const layout = imagePageLayout(image, options)
    const page = output.addPage([layout.page.width, layout.page.height])
    page.drawImage(embedded, layout.image)
  }
  if (options.title) output.setTitle(options.title)
  output.setProducer('Doxera')
  return output.save()
}
