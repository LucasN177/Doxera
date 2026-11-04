// @vitest-environment node
import * as mupdf from 'mupdf'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildPdf } from '@/engine/document/buildPdf'
import type { PageRef } from '@/types/document'
import { applyRedactions } from './redact'

async function samplePdf() {
  const document = await PDFDocument.create()
  const font = await document.embedFont(StandardFonts.Helvetica)
  const page = document.addPage([600, 800])
  // Top half: secret, bottom half: public (y grows upwards in PDF)
  page.drawText('SECRET 4711', { x: 50, y: 700, size: 24, font })
  page.drawText('PUBLIC TEXT', { x: 50, y: 200, size: 24, font })
  return document.save()
}

function pageText(data: Uint8Array): string {
  const document = new mupdf.PDFDocument(data)
  const page = document.loadPage(0)
  const text = page.toStructuredText('preserve-whitespace').asText()
  const annotations = page.getAnnotations().map((item) => item.getType())
  page.destroy()
  document.destroy()
  return `${text}|${annotations.join(',')}`
}

describe('applyRedactions', () => {
  it('removes the text below redaction areas from the exported file', async () => {
    const data = await samplePdf()
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 0,
      annotations: [
        // Covers the upper text line (stored fractions, origin top left)
        {
          id: 'r',
          type: 'redact',
          color: '#000000',
          a: { x: 0.05, y: 0.1 },
          b: { x: 0.7, y: 0.15 },
        },
      ],
    }
    const result = await buildPdf([page], new Map([['s', { data }]]), {
      redact: async (bytes) => applyRedactions(mupdf, bytes),
    })

    const text = pageText(result)
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('4711')
    expect(text).toContain('PUBLIC TEXT')
    // The redaction annotation itself is gone after applying it
    expect(text).not.toContain('Redact')
  })

  it('keeps the file unchanged in content when there is nothing to redact', async () => {
    const data = await samplePdf()
    const text = pageText(applyRedactions(mupdf, data))
    expect(text).toContain('SECRET 4711')
    expect(text).toContain('PUBLIC TEXT')
  })
})
