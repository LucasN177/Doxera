// @vitest-environment node
import * as mupdf from 'mupdf'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { compressPdf } from './compress'
import { extractPageContent } from './pageContent'

/** A photo-like PNG (gradients with grain), large in pixels. */
function photoPng(width: number, height: number, alpha = false): Uint8Array {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], alpha)
  const pixels = pixmap.getPixels()
  const channels = alpha ? 4 : 3
  let seed = 7
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      const grain = (seed >>> 24) % 24
      const i = (y * width + x) * channels
      pixels[i] = Math.min(255, ((x / width) * 200 + grain) | 0)
      pixels[i + 1] = Math.min(255, ((y / height) * 180 + grain) | 0)
      pixels[i + 2] = Math.min(255, (120 + grain) | 0)
      if (alpha) pixels[i + 3] = x < width / 2 ? 255 : 128
    }
  }
  const png = pixmap.asPNG().slice()
  pixmap.destroy()
  return png
}

async function samplePdf() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  page.drawText('Bericht mit Foto', { x: 50, y: 780, size: 20, font })
  // 2000 × 1500 pixels shown at 300 × 225 pt (480 dpi)
  page.drawImage(await pdf.embedPng(photoPng(2000, 1500)), {
    x: 50,
    y: 450,
    width: 300,
    height: 225,
  })
  page.drawImage(await pdf.embedPng(photoPng(400, 300, true)), {
    x: 50,
    y: 150,
    width: 200,
    height: 150,
  })
  return pdf.save()
}

function inspect(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    const content = extractPageContent(document, 0)
    let smasks = 0
    for (let number = 1; number < document.countObjects(); number++) {
      const object = document.newIndirect(number).resolve()
      if (object.isDictionary() && object.get('SMask').isIndirect()) smasks++
    }
    return {
      text: content.lines.map((line) => line.text),
      images: content.images.map((image) => [image.width, image.height]),
      smasks,
    }
  } finally {
    document.destroy()
  }
}

describe('compressPdf', () => {
  it('scales large images down to the target resolution and keeps the rest', async () => {
    const data = await samplePdf()
    const result = compressPdf(mupdf, data, 'strong')
    expect(result.after).toBeLessThan(result.before * 0.3)
    expect(result.images).toEqual({ recompressed: 2, total: 2 })

    const after = inspect(result.data)
    expect(after.text).toEqual(['Bericht mit Foto'])
    // 300 pt at 96 dpi = 400 pixels
    expect(after.images[0]).toEqual([400, 300])
    // Transparency is kept
    expect(after.smasks).toBe(1)
  })

  it('keeps images as they are when lossless and never grows the file', async () => {
    const data = await samplePdf()
    const result = compressPdf(mupdf, data, 'lossless')
    expect(result.after).toBeLessThanOrEqual(result.before)
    expect(result.images.recompressed).toBe(0)
    expect(inspect(result.data).images[0]).toEqual([2000, 1500])
  })
})
