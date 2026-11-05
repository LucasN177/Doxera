// @vitest-environment node
import * as mupdf from 'mupdf'
import { degrees, PDFDocument } from 'pdf-lib'
import { extractPageContent } from '@/engine/mupdf/pageContent'
import type { WorkflowStep } from '@/types/workflow'
import { defaultStep } from './templates'
import { watermarkPdf } from './watermark'

describe('watermarkPdf', () => {
  it('draws the watermark on every page, also on rotated ones', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([595, 842])
    pdf.addPage([595, 842]).setRotation(degrees(90))
    const step = {
      ...defaultStep('watermark'),
      text: 'ENTWURF',
    } as Extract<WorkflowStep, { type: 'watermark' }>
    const result = await watermarkPdf(await pdf.save(), step)

    const document = new mupdf.PDFDocument(result)
    try {
      expect(document.countPages()).toBe(2)
      for (const index of [0, 1]) {
        const { lines } = extractPageContent(document, index)
        expect(lines.map((line) => line.text)).toEqual(['ENTWURF'])
      }
    } finally {
      document.destroy()
    }
  })

  it('draws a picture instead of the text', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage([595, 842])
    // A 2×1 PNG
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwQZGBgAKPAD/R7gYx0AAAAASUVORK5CYII=',
      ),
      (char) => char.charCodeAt(0),
    )
    const step = {
      ...defaultStep('watermark'),
      image: { mimeType: 'image/png', data: png, width: 2, height: 1 },
      size: 0.5,
    } as Extract<WorkflowStep, { type: 'watermark' }>
    const result = await watermarkPdf(await pdf.save(), step)

    const document = new mupdf.PDFDocument(result)
    try {
      expect(extractPageContent(document, 0).lines).toEqual([])
      const page = document.loadPage(0)
      const contents = page.getObject().get('Contents')
      const stream = contents.isArray() ? contents.get(contents.length - 1) : contents
      const content = stream.readStream().asString()
      page.destroy()
      // The picture is drawn at half the page width (2:1, so a quarter high)
      expect(content).toMatch(/297\.5 0 0 148\.75 0 0 cm[\s\S]*\/Image[\w-]+ Do/)
    } finally {
      document.destroy()
    }
  })
})
