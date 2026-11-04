import { PDFDocument } from 'pdf-lib'
import { imagePageLayout, imagesToPdf, PAPER_SIZES } from './imagesToPdf'

// Smallest valid PNG: 1 × 1 pixel
const PNG_1PX = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (char) => char.charCodeAt(0),
)

describe('imagePageLayout', () => {
  it('fits portrait images on A4 within the margins', () => {
    const { page, image } = imagePageLayout(
      { width: 1000, height: 2000 },
      { format: 'a4', margin: 36 },
    )
    expect(page).toEqual(PAPER_SIZES.a4)
    expect(image.height).toBeCloseTo(841.89 - 72, 1)
    expect(image.width).toBeCloseTo(image.height / 2, 1)
    expect(image.x).toBeCloseTo((page.width - image.width) / 2, 3)
  })

  it('turns the paper for wide images', () => {
    const { page } = imagePageLayout({ width: 4000, height: 3000 }, { format: 'letter', margin: 0 })
    expect(page).toEqual({ width: 792, height: 612 })
  })

  it('uses the image size at 96 dpi for "image"', () => {
    const { page, image } = imagePageLayout(
      { width: 960, height: 480 },
      { format: 'image', margin: 36 },
    )
    expect(page).toEqual({ width: 720, height: 360 })
    expect(image).toEqual({ x: 0, y: 0, width: 720, height: 360 })
  })
})

describe('imagesToPdf', () => {
  it('creates one page per image', async () => {
    const image = { mimeType: 'image/png' as const, data: PNG_1PX, width: 1, height: 1 }
    const data = await imagesToPdf([image, image, image], { format: 'a4', margin: 0 })
    const pdf = await PDFDocument.load(data)
    expect(pdf.getPageCount()).toBe(3)
  })
})
