import { embedUnicodeFont, needsUnicode } from '@/engine/fonts/unicodeFont'
import { encodable, hexToRgb } from './drawAnnotations'
import { hasStamps, stampItems, type HeaderFooter } from './headerFooter'

/**
 * Visible point (from the top left of the page as displayed) → PDF user
 * space, plus the text angle that keeps text upright on screen.
 */
export function visibleToUser(
  u: number,
  v: number,
  box: { x: number; y: number; width: number; height: number },
  rotation: number,
): { x: number; y: number; angle: number } {
  const { x, y, width: w, height: h } = box
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: x + v, y: y + u, angle: 90 }
    case 180:
      return { x: x + w - u, y: y + v, angle: 180 }
    case 270:
      return { x: x + w - v, y: y + h - u, angle: 270 }
    default:
      return { x: x + u, y: y + h - v, angle: 0 }
  }
}

/**
 * Draws page numbers, headers and footers onto every page of a PDF, upright
 * in the visible (rotated, cropped) page.
 */
export async function stampPdf(
  data: Uint8Array,
  settings: HeaderFooter,
  fileName: string,
  date = new Date(),
): Promise<Uint8Array> {
  if (!hasStamps(settings)) return data
  const lib = await import('pdf-lib')
  const { PDFDocument, StandardFonts, degrees, rgb } = lib
  const document = await PDFDocument.load(data, { ignoreEncryption: true })
  const unicode = needsUnicode([...settings.header, ...settings.footer, fileName].join(''))
  const font = unicode
    ? await embedUnicodeFont(document)
    : await document.embedFont(StandardFonts.Helvetica)
  const [r, g, b] = hexToRgb(settings.color)
  const pages = document.getPages()
  pages.forEach((page, index) => {
    const box = page.getCropBox()
    const rotation = page.getRotation().angle
    const sideways = ((rotation % 180) + 180) % 180 === 90
    const size = sideways
      ? { width: box.height, height: box.width }
      : { width: box.width, height: box.height }
    const items = stampItems(
      settings,
      { index, total: pages.length, fileName, date },
      size,
      (text) => font.widthOfTextAtSize(encodable(font, text), settings.fontSize),
    )
    for (const item of items) {
      const point = visibleToUser(item.x, item.baseline, box, rotation)
      page.drawText(encodable(font, item.text), {
        x: point.x,
        y: point.y,
        size: settings.fontSize,
        font,
        color: rgb(r, g, b),
        rotate: degrees(point.angle),
      })
    }
  })
  return document.save()
}
