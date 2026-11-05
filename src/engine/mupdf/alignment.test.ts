// @vitest-environment node
import * as mupdf from 'mupdf'
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib'
import { placeRuns } from '@/engine/document/annotations'
import { buildPdf } from '@/engine/document/buildPdf'
import {
  replacementFor,
  toEditableLines,
  toEditableParagraphs,
  type EditableLine,
} from '@/engine/document/contentEditing'
import type { PageRef } from '@/types/document'
import { extractPageContent } from './pageContent'
import { applyRedactions } from './redact'

const SIZE = { width: 600, height: 800 }

/** A synthetic line, 12 pt on 16 pt spacing, from x0 to x1 (points). */
const line = (index: number, x0: number, x1: number, text = `Zeile ${index}`): EditableLine => ({
  text,
  rect: {
    a: { x: x0 / 600, y: (100 + index * 16) / 800 },
    b: { x: x1 / 600, y: (112 + index * 16) / 800 },
  },
  at: { x: x0 / 600, y: (100 + index * 16) / 800 },
  fontSize: 12,
  color: '#000000',
  font: 'sans',
  bold: false,
  italic: false,
  turns: 0,
})

function readLines(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    return toEditableLines(extractPageContent(document, 0, mupdf))
  } finally {
    document.destroy()
  }
}

async function exportEdit(data: Uint8Array, edit: (text: string) => string, pick = 0) {
  const target = toEditableParagraphs(readLines(data), SIZE)[pick]!
  const replacement = replacementFor(target, 'edit')
  replacement.text = edit(replacement.text)
  const page: PageRef = {
    id: 'p',
    sourceId: 's',
    sourceIndex: 0,
    rotation: 0,
    annotations: [replacement],
  }
  return {
    replacement,
    result: await buildPdf([page], new Map([['s', { data }]]), {
      redact: async (bytes, mode) => applyRedactions(mupdf, bytes, mode),
    }),
  }
}

describe('alignment of paragraphs', { timeout: 30_000 }, () => {
  it('recognizes justified, centered and right-aligned paragraphs', () => {
    const align = (lines: EditableLine[]) => toEditableParagraphs(lines, SIZE)[0]?.paragraph?.align
    expect(align([line(0, 60, 540), line(1, 60, 540), line(2, 60, 300)])).toBe('justify')
    expect(align([line(0, 60, 500), line(1, 60, 540), line(2, 60, 300)])).toBe('left')
    expect(align([line(0, 200, 400), line(1, 150, 450), line(2, 250, 350)])).toBe('center')
    expect(align([line(0, 300, 540), line(1, 200, 540), line(2, 400, 540)])).toBe('right')
  })

  it('spreads justified words to the full width, but not on the last line', () => {
    const measure = (text: string) => text.length * 10
    expect(placeRuns({ text: 'aa bb cc', last: false }, 'justify', 100, measure)).toEqual([
      { text: 'aa', x: 0 },
      { text: 'bb', x: 40 },
      { text: 'cc', x: 80 },
    ])
    expect(placeRuns({ text: 'aa bb', last: true }, 'justify', 100, measure)).toEqual([
      { text: 'aa bb', x: 0 },
    ])
    expect(placeRuns({ text: 'abc', last: true }, 'center', 100, measure)).toEqual([
      { text: 'abc', x: 35 },
    ])
    expect(placeRuns({ text: 'abc', last: true }, 'right', 100, measure)).toEqual([
      { text: 'abc', x: 70 },
    ])
  })

  it('exports centered paragraphs centered', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([600, 800])
    for (const [i, text] of [
      'Einladung zur',
      'Mitgliederversammlung des Vereins',
      'am Freitag',
    ].entries()) {
      const width = font.widthOfTextAtSize(text, 14)
      page.drawText(text, { x: 300 - width / 2, y: 700 - i * 18, size: 14, font })
    }
    const { replacement, result } = await exportEdit(await pdf.save(), (text) =>
      text.replace('Freitag', 'Samstag, 14 Uhr'),
    )
    expect(replacement.align).toBe('center')
    for (const item of readLines(result)) {
      const middle = ((item.rect.a.x + item.rect.b.x) / 2) * 600
      expect(Math.abs(middle - 300)).toBeLessThan(2)
    }
  })
})

describe('text in other directions', { timeout: 30_000 }, () => {
  it('edits text running up the page', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([600, 800])
    page.drawText('Entwurf vom Mai', { x: 40, y: 200, size: 14, font, rotate: degrees(90) })
    const data = await pdf.save()
    const [original] = readLines(data)
    expect(original).toMatchObject({ text: 'Entwurf vom Mai', turns: 1 })

    const { replacement, result } = await exportEdit(data, () => 'Final vom Juni')
    expect(replacement.turns).toBe(1)
    const [edited] = readLines(result)
    expect(edited).toMatchObject({ text: 'Final vom Juni', turns: 1 })
    // Starts where the original started (bottom left of the line, running up)
    expect(edited!.rect.b.y).toBeCloseTo(original!.rect.b.y, 2)
    expect(Math.abs(edited!.rect.a.x - original!.rect.a.x) * 600).toBeLessThan(2)
  })
})
