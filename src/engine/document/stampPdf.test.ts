// @vitest-environment node
import * as mupdf from 'mupdf'
import { degrees, PDFDocument } from 'pdf-lib'
import { DEFAULT_HEADER_FOOTER } from './headerFooter'
import { stampPdf, visibleToUser } from './stampPdf'

interface Line {
  text: string
  x: number
  y: number
  w: number
  h: number
}

/** Text lines per page with boxes in displayed coordinates (top left origin). */
function lines(data: Uint8Array): Line[][] {
  const document = new mupdf.PDFDocument(data)
  const result: Line[][] = []
  for (let index = 0; index < document.countPages(); index++) {
    const page = document.loadPage(index)
    const json = JSON.parse(page.toStructuredText('preserve-whitespace').asJSON()) as {
      blocks: Array<{ lines?: Array<{ text: string; bbox: Omit<Line, 'text'> }> }>
    }
    result.push(
      json.blocks.flatMap((block) =>
        (block.lines ?? []).map((line) => ({ text: line.text, ...line.bbox })),
      ),
    )
    page.destroy()
  }
  document.destroy()
  return result
}

describe('stampPdf', { timeout: 30_000 }, () => {
  it('maps visible points for every rotation', () => {
    const box = { x: 10, y: 20, width: 200, height: 100 }
    expect(visibleToUser(5, 7, box, 0)).toEqual({ x: 15, y: 113, angle: 0 })
    expect(visibleToUser(5, 7, box, 90)).toEqual({ x: 17, y: 25, angle: 90 })
    expect(visibleToUser(5, 7, box, 180)).toEqual({ x: 205, y: 27, angle: 180 })
    expect(visibleToUser(5, 7, box, 270)).toEqual({ x: 203, y: 115, angle: 270 })
  })

  it('puts footers upright at the bottom of rotated and cropped pages', async () => {
    const source = await PDFDocument.create()
    source.addPage([600, 800])
    source.addPage([600, 800]).setRotation(degrees(90))
    const cropped = source.addPage([600, 800])
    cropped.setCropBox(100, 100, 300, 400)
    source.addPage([600, 800]).setRotation(degrees(270))
    const stamped = await stampPdf(
      await source.save(),
      {
        ...DEFAULT_HEADER_FOOTER,
        header: ['{datei}', '', ''],
        footer: ['', 'Seite {seite} von {seiten}', ''],
        fontSize: 10,
        margin: 20,
      },
      'Bericht.pdf',
    )
    const pages = lines(stamped)
    const sizes = [
      [600, 800],
      [800, 600],
      [300, 400],
      [800, 600],
    ]
    pages.forEach((page, index) => {
      const [width, height] = sizes[index]!
      const footer = page.find((line) => line.text.startsWith('Seite'))!
      expect(footer.text).toBe(`Seite ${index + 1} von 4`)
      // Horizontal (wider than high), centered, near the bottom edge
      expect(footer.w).toBeGreaterThan(footer.h)
      expect(Math.abs(footer.x + footer.w / 2 - width / 2)).toBeLessThan(2)
      expect(height - (footer.y + footer.h)).toBeGreaterThan(15)
      expect(height - (footer.y + footer.h)).toBeLessThan(25)
      const header = page.find((line) => line.text === 'Bericht')!
      expect(Math.abs(header.x - 20)).toBeLessThan(2)
      expect(header.y).toBeGreaterThan(15)
      expect(header.y).toBeLessThan(25)
    })
  })

  it('leaves the file alone without any text', async () => {
    const data = new Uint8Array([1, 2, 3])
    expect(await stampPdf(data, { ...DEFAULT_HEADER_FOOTER, footer: ['', '', ''] }, 'x.pdf')).toBe(
      data,
    )
  })
})
