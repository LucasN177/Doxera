// @vitest-environment node
import * as mupdf from 'mupdf'
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { buildPdf } from '@/engine/document/buildPdf'
import type { PageRef } from '@/types/document'
import { replacementFor, toEditableLines } from '@/engine/document/textEditing'
import { applyRedactions } from './redact'
import { extractTextLines } from './textLines'

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
      redact: async (bytes, mode) => applyRedactions(mupdf, bytes, mode),
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

async function linesOf(data: Uint8Array, index = 0) {
  const document = new mupdf.PDFDocument(data)
  try {
    const page = document.loadPage(index)
    const rotate = page.getObject().get('Rotate').valueOf()
    page.destroy()
    return toEditableLines(extractTextLines(document, index), Number(rotate) || 0)
  } finally {
    document.destroy()
  }
}

describe('editing existing text', () => {
  it('reads lines with position, size, font and color', async () => {
    const pdf = await PDFDocument.create()
    const bold = await pdf.embedFont(StandardFonts.TimesRomanBold)
    const page = pdf.addPage([600, 800])
    page.drawText('Hello World', { x: 60, y: 700, size: 24, font: bold, color: rgb(0.8, 0, 0) })
    const [line] = await linesOf(await pdf.save())
    expect(line).toMatchObject({
      text: 'Hello World',
      fontSize: 24,
      color: '#cc0000',
      font: 'serif',
      bold: true,
      italic: false,
    })
    // Baseline at y = 700 (from the bottom) → 100 pt from the top; box top = baseline - ascent
    expect(line.at.x).toBeCloseTo(60 / 600, 3)
    expect(line.at.y).toBeCloseTo((100 - 24 * 0.8) / 800, 3)
  })

  it('maps lines of pages with their own rotation to the unrotated page', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([600, 800])
    page.setRotation(degrees(90))
    page.drawText('Rotated', { x: 60, y: 700, size: 20, font })
    const [line] = await linesOf(await pdf.save())
    expect(line.text).toBe('Rotated')
    expect(line.at.x).toBeCloseTo(60 / 600, 2)
    expect(line.rect.b.y).toBeCloseTo(100 / 800, 1)
  })

  it('replaces a line in the export: old text removed, new text drawn, rest kept', async () => {
    const data = await samplePdf()
    const [secret] = await linesOf(data)
    expect(secret.text).toBe('SECRET 4711')
    const replacement = { ...replacementFor(secret, 'e'), text: 'Geheim entfernt' }
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 90,
      annotations: [replacement],
    }
    const result = await buildPdf([page], new Map([['s', { data }]]), {
      redact: async (bytes, mode) => applyRedactions(mupdf, bytes, mode),
    })
    const text = pageText(result)
    expect(text).not.toContain('SECRET')
    expect(text).toContain('Geheim entfernt')
    expect(text).toContain('PUBLIC TEXT')
    expect(text).not.toContain('Redact')
  })
})
