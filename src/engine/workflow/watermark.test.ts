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
})
