// @vitest-environment node
import * as mupdf from 'mupdf'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { wrapLine } from '@/engine/document/annotations'
import { buildPdf } from '@/engine/document/buildPdf'
import {
  replacementFor,
  toEditableLines,
  toEditableParagraphs,
} from '@/engine/document/contentEditing'
import type { PageRef } from '@/types/document'
import { extractPageContent } from './pageContent'
import { applyRedactions } from './redact'

const SIZE = { width: 600, height: 800 }

/** Two paragraphs (4 + 2 lines, 14 pt on 18 pt), a heading and a table row. */
async function samplePdf() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([SIZE.width, SIZE.height])
  page.drawText('Mietvertrag', { x: 60, y: 740, size: 20, font: bold })
  const first = [
    'Der Mieter zahlt eine monatliche Miete von achthundert',
    'Euro, fällig jeweils am dritten Werktag des Monats, auf',
    'das Konto des Vermieters. Nebenkosten werden jährlich',
    'abgerechnet.',
  ]
  first.forEach((text, i) => page.drawText(text, { x: 60, y: 700 - i * 18, size: 14, font }))
  const second = [
    'Die Kündigungsfrist beträgt drei Monate zum Ende eines',
    'Kalendervierteljahres.',
  ]
  second.forEach((text, i) => page.drawText(text, { x: 60, y: 610 - i * 18, size: 14, font }))
  page.drawText('Posten', { x: 60, y: 540, size: 14, font })
  page.drawText('800,00', { x: 400, y: 540, size: 14, font })
  return pdf.save()
}

function readLines(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    return toEditableLines(extractPageContent(document, 0))
  } finally {
    document.destroy()
  }
}

describe('editing paragraphs', { timeout: 30_000 }, () => {
  it('groups lines into paragraphs and leaves headings and table rows alone', async () => {
    const paragraphs = toEditableParagraphs(readLines(await samplePdf()), SIZE)
    expect(paragraphs.map((item) => item.text)).toEqual([
      'Mietvertrag',
      'Der Mieter zahlt eine monatliche Miete von achthundert Euro, fällig jeweils am dritten Werktag des Monats, auf das Konto des Vermieters. Nebenkosten werden jährlich abgerechnet.',
      'Die Kündigungsfrist beträgt drei Monate zum Ende eines Kalendervierteljahres.',
      'Posten',
      '800,00',
    ])
    const [, first] = paragraphs
    expect(first!.paragraph?.lines).toHaveLength(4)
    expect(first!.paragraph?.lineHeight).toBeCloseTo(18 / 14, 2)
    expect(paragraphs[0]!.paragraph).toBeUndefined()
    expect(paragraphs[3]!.paragraph).toBeUndefined()
  })

  it('wraps at spaces and keeps long words whole', () => {
    const measure = (text: string) => text.length
    expect(wrapLine('aa bb cc dd', 5, measure)).toEqual(['aa bb', 'cc dd'])
    expect(wrapLine('Donaudampfschiff ab', 5, measure)).toEqual(['Donaudampfschiff', 'ab'])
  })

  it('exports an edited paragraph wrapped within its width, the old lines removed', async () => {
    const data = await samplePdf()
    const paragraphs = toEditableParagraphs(readLines(data), SIZE)
    const replacement = replacementFor(paragraphs[1]!, 'edit')
    replacement.text = replacement.text.replace('achthundert', 'neunhundertfünfzig')
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 0,
      annotations: [replacement],
    }
    const result = await buildPdf([page], new Map([['s', { data }]]), {
      redact: async (bytes, mode) => applyRedactions(mupdf, bytes, mode),
    })
    const lines = readLines(result)
    const text = lines.map((line) => line.text).join('\n')
    expect(text).not.toContain('achthundert')
    expect(text).toContain('neunhundertfünfzig')
    // The other paragraph and the heading stay untouched
    expect(text).toContain('Kalendervierteljahres.')
    expect(text).toContain('Mietvertrag')
    // Every new line stays within the paragraph's width and uses its line spacing
    const edited = lines.filter((line) => line.at.y > 0.1 && line.at.y < 0.2)
    const right = paragraphs[1]!.rect.b.x
    for (const line of edited) expect(line.rect.b.x).toBeLessThanOrEqual(right + 2 / SIZE.width)
    expect(edited.length).toBeGreaterThanOrEqual(4)
    const gaps = edited.slice(1).map((line, i) => (line.at.y - edited[i]!.at.y) * SIZE.height)
    for (const gap of gaps) expect(gap).toBeCloseTo(18, 0)
  })
})
