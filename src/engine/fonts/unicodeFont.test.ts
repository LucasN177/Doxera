// @vitest-environment node
import * as mupdf from 'mupdf'
import { PDFDocument } from 'pdf-lib'
import { buildPdf } from '@/engine/document/buildPdf'
import { DEFAULT_HEADER_FOOTER } from '@/engine/document/headerFooter'
import { stampPdf } from '@/engine/document/stampPdf'
import type { PageRef } from '@/types/document'
import { needsUnicode, unicodeStyle } from './unicodeFont'

function text(data: Uint8Array): string {
  const document = new mupdf.PDFDocument(data)
  const page = document.loadPage(0)
  const result = page.toStructuredText('preserve-whitespace').asText()
  page.destroy()
  document.destroy()
  return result
}

async function blankPdf() {
  const document = await PDFDocument.create()
  document.addPage([400, 300])
  return document.save()
}

describe('Unicode font', { timeout: 30_000 }, () => {
  it('knows which texts the standard fonts can show', () => {
    expect(needsUnicode('Größe: 5 € – „gut“ … naïve façade')).toBe(false)
    expect(needsUnicode('Zażółć gęślą jaźń')).toBe(true)
    expect(needsUnicode('Привет')).toBe(true)
    expect(needsUnicode('x ≤ 5')).toBe(true)
    expect(unicodeStyle(true, true)).toBe('BoldItalic')
  })

  it('exports text boxes, watermarks and footers with any Latin, Greek or Cyrillic letters', async () => {
    const page: PageRef = {
      id: 'p',
      sourceId: 'a',
      sourceIndex: 0,
      rotation: 0,
      annotations: [
        {
          id: 't',
          type: 'text',
          at: { x: 0.1, y: 0.1 },
          text: 'Zażółć gęślą jaźń',
          fontSize: 14,
          color: '#000000',
          bold: true,
          turns: 0,
        },
        {
          id: 'w',
          type: 'watermark',
          text: 'ΕΜΠΙΣΤΕΥΤΙΚΟ',
          color: '#888888',
          size: 0.6,
          opacity: 0.3,
          angle: 0,
          turns: 0,
        },
      ],
    }
    const built = await buildPdf([page], new Map([['a', { data: await blankPdf() }]]))
    const stamped = await stampPdf(
      built,
      { ...DEFAULT_HEADER_FOOTER, footer: ['', 'Страница {seite} 🙂', ''] },
      'x.pdf',
    )
    const result = text(stamped)
    expect(result).toContain('Zażółć gęślą jaźń')
    expect(result).toContain('ΕΜΠΙΣΤΕΥΤΙΚΟ')
    // Emoji aren't in the font: replaced, the rest stays
    expect(result).toContain('Страница 1 ?')
  })
})
