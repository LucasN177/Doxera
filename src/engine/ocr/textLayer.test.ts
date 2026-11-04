// @vitest-environment node
import * as mupdf from 'mupdf'
import { createWorker, OEM } from 'tesseract.js'
import { degrees, PDFDocument } from 'pdf-lib'
import { extractPageContent } from '@/engine/mupdf/pageContent'
import type { OcrPage } from '@/types/ocr'
import { fromTesseract, ocrText, type TesseractPage } from './result'
import { buildOcrPdf } from './textLayer'

/** One line with two words in the upper left of the (displayed) page. */
const sample: OcrPage = {
  confidence: 90,
  blocks: [
    {
      box: [0.1, 0.1, 0.5, 0.13],
      paragraphs: [
        {
          box: [0.1, 0.1, 0.5, 0.13],
          lines: [
            {
              box: [0.1, 0.1, 0.5, 0.13],
              baseline: [0.1, 0.125, 0.5, 0.125],
              words: [
                { text: 'Hallo', box: [0.1, 0.1, 0.25, 0.13], confidence: 95 },
                { text: 'Welt', box: [0.3, 0.1, 0.5, 0.13], confidence: 85 },
              ],
            },
          ],
        },
      ],
    },
  ],
}

async function blankPdf(rotate = 0) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([600, 800])
  if (rotate) page.setRotation(degrees(rotate))
  return pdf.save()
}

function linesOf(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    return extractPageContent(document, 0)
  } finally {
    document.destroy()
  }
}

describe('OCR text layer', () => {
  it.each([0, 90])('places the words where they were seen (page rotation %i)', async (rotate) => {
    const data = await blankPdf(rotate)
    const result = await buildOcrPdf(
      [{ sourceId: 's', sourceIndex: 0, rotate, ocr: sample }],
      new Map([['s', { data }]]),
    )
    const { bounds, lines } = linesOf(result)
    expect(lines.map((line) => line.text)).toEqual(['Hallo Welt'])
    const [line] = lines
    const width = bounds[2] - bounds[0]
    const height = bounds[3] - bounds[1]
    // In MuPDF's page space (as displayed): from x = 10 % to about 50 %
    expect(line.bbox[0] / width).toBeCloseTo(0.1, 2)
    expect(line.bbox[2] / width).toBeGreaterThan(0.49)
    expect(line.bbox[2] / width).toBeLessThan(0.53)
    expect(line.origin[1] / height).toBeCloseTo(0.125, 2)
    expect(line.direction[0]).toBeCloseTo(1, 3)
  })

  it('joins the recognized text into lines and paragraphs', () => {
    expect(ocrText(sample)).toBe('Hallo Welt')
  })
})

describe('Tesseract', () => {
  it('recognizes rendered text and returns word boxes', async () => {
    // Render a line of text with MuPDF as the "scan"
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont('Helvetica')
    pdf.addPage([400, 100]).drawText('Doxera erkennt Text', { x: 20, y: 40, size: 28, font })
    const document = new mupdf.PDFDocument(await pdf.save())
    const page = document.loadPage(0)
    const pixmap = page.toPixmap(mupdf.Matrix.scale(3, 3), mupdf.ColorSpace.DeviceRGB, false)
    // Node's Buffer (the app's tsconfig has no Node types)
    const { Buffer } = globalThis as unknown as {
      Buffer: { from: (data: Uint8Array) => Uint8Array }
    }
    const png = Buffer.from(pixmap.asPNG())
    const [width, height] = [pixmap.getWidth(), pixmap.getHeight()]
    pixmap.destroy()
    page.destroy()
    document.destroy()

    const worker = await createWorker('deu', OEM.LSTM_ONLY, {
      langPath: 'node_modules/@tesseract.js-data/deu/4.0.0_best_int',
      gzip: true,
      cacheMethod: 'none',
    })
    try {
      const { data } = await worker.recognize(png, {}, { blocks: true, text: false })
      const result = fromTesseract(data as unknown as TesseractPage, width, height)
      expect(ocrText(result)).toBe('Doxera erkennt Text')
      const first = result.blocks[0].paragraphs[0].lines[0].words[0]
      expect(first.box[0]).toBeCloseTo(20 / 400, 1)
      expect(result.confidence).toBeGreaterThan(80)
    } finally {
      await worker.terminate()
    }
  }, 60_000)
})
