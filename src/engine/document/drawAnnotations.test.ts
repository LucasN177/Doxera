import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import type { Annotation, ImageAnnotation, TextAnnotation } from '@/types/annotations'
import type { PageRef } from '@/types/document'
import { imagePlacement } from './annotations'
import { buildPdf } from './buildPdf'
import { arrowHead, hexToRgb, textBaselines, toPdf } from './drawAnnotations'

const box = { x: 0, y: 0, width: 600, height: 800 }
const text = (turns: number, lines = 'A\nB'): TextAnnotation => ({
  id: 't',
  type: 'text',
  color: '#000000',
  at: { x: 0.1, y: 0.1 },
  text: lines,
  fontSize: 10,
  turns,
})

describe('drawAnnotations helpers', () => {
  it('parses hex colors', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0])
    expect(hexToRgb('#0f0')).toEqual([0, 1, 0])
  })

  it('maps page fractions to PDF coordinates (y up)', () => {
    expect(toPdf({ x: 0.5, y: 0.25 }, { x: 10, y: 20, width: 100, height: 200 })).toEqual({
      x: 60,
      y: 170,
    })
  })

  it('lays out text lines downwards on an unrotated page', () => {
    const [first, second] = textBaselines(text(0), box)
    expect(first).toMatchObject({ x: 60, rotate: 0 })
    expect(first.y).toBeCloseTo(800 - 80 - 8) // top at 80pt, ascent 8pt
    expect(second.y).toBeCloseTo(first.y - 12) // line height 1.2 × 10pt
  })

  it('keeps text upright when it was written on a rotated page', () => {
    // Written while the page was shown with a quarter turn clockwise
    const [first, second] = textBaselines(text(1), box)
    expect(first.rotate).toBe(90)
    // The page is shown turned clockwise, so "down" on screen is "right" on the unrotated page
    expect(second.x).toBeCloseTo(first.x + 12)
    expect(second.y).toBeCloseTo(first.y)
  })

  it('draws the arrow head behind the tip', () => {
    const head = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 2)
    for (const [x] of head) expect(x).toBeLessThan(100)
  })
})

describe('buildPdf with annotations', () => {
  it('draws all annotation types into the page', async () => {
    const source = await PDFDocument.create()
    source.addPage([600, 800])
    const data = new Uint8Array(await source.save())
    const annotations: Annotation[] = [
      {
        id: '1',
        type: 'rect',
        color: '#e11d48',
        a: { x: 0.1, y: 0.1 },
        b: { x: 0.4, y: 0.3 },
        strokeWidth: 2,
        filled: true,
      },
      {
        id: '2',
        type: 'ellipse',
        color: '#2563eb',
        a: { x: 0.5, y: 0.1 },
        b: { x: 0.8, y: 0.3 },
        strokeWidth: 1,
        filled: false,
      },
      {
        id: '3',
        type: 'arrow',
        color: '#16a34a',
        a: { x: 0.1, y: 0.5 },
        b: { x: 0.6, y: 0.6 },
        strokeWidth: 3,
      },
      { ...text(0, 'Prüfung ✓ 👍'), id: '4' },
    ]
    const page: PageRef = { id: 'p', sourceId: 's', sourceIndex: 0, rotation: 0, annotations }

    const before = data.length
    const result = await buildPdf([page], new Map([['s', { data }]]))
    const doc = await PDFDocument.load(result)
    expect(doc.getPageCount()).toBe(1)
    // The page now carries drawing commands and an embedded font
    expect(result.length).toBeGreaterThan(before + 500)
    const fonts = doc.getPage(0).node.Resources()?.lookup(PDFName.of('Font'), PDFDict)
    expect(fonts?.keys().length).toBeGreaterThan(0)
  })
})

describe('buildPdf with notes', () => {
  it('writes notes as standard PDF text annotations', async () => {
    const source = await PDFDocument.create()
    source.addPage([600, 800])
    const data = new Uint8Array(await source.save())
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 0,
      annotations: [
        {
          id: 'n',
          type: 'note',
          color: '#facc15',
          at: { x: 0.5, y: 0.25 },
          text: 'Bitte prüfen ✓',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    }
    const doc = await PDFDocument.load(await buildPdf([page], new Map([['s', { data }]])))
    const annots = doc.getPage(0).node.Annots()
    expect(annots?.size()).toBe(1)
    const note = annots!.lookup(0, PDFDict)
    expect(note.get(PDFName.of('Subtype'))).toBe(PDFName.of('Text'))
    expect(note.lookup(PDFName.of('Contents'), PDFHexString).decodeText()).toBe('Bitte prüfen ✓')
    const rect = note.lookup(PDFName.of('Rect'), PDFArray).asRectangle()
    expect(rect).toMatchObject({ x: 300, y: 580, width: 20, height: 20 })
  })
})

// 1×1 transparent PNG
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

describe('images', () => {
  const image = (turns: number): ImageAnnotation => ({
    id: 'i',
    type: 'image',
    color: '#000',
    a: { x: 0.1, y: 0.1 },
    b: { x: 0.5, y: 0.3 },
    assetId: 'asset',
    turns,
  })

  it('places an upright image by its bottom-left corner', () => {
    const placement = imagePlacement(image(0), { width: 600, height: 800 })
    expect(placement.origin).toEqual({ x: 0.1, y: 0.3 })
    expect(placement.width).toBeCloseTo(240)
    expect(placement.height).toBeCloseTo(160)
    expect(placement.rotate).toBe(0)
  })

  it('counter-rotates images inserted on a rotated page', () => {
    // Inserted while the page was shown turned a quarter clockwise
    const placement = imagePlacement(
      { ...image(1), a: { x: 0.1, y: 0.1 }, b: { x: 0.3, y: 0.5 } },
      { width: 600, height: 800 },
    )
    expect(placement.rotate).toBe(90)
    // Box was 0.4 of the displayed width (800pt) and 0.2 of its height (600pt)
    expect(placement.width).toBeCloseTo(320)
    expect(placement.height).toBeCloseTo(120)
  })

  it('embeds each image once and draws it on every page that uses it', async () => {
    const source = await PDFDocument.create()
    source.addPage([600, 800])
    source.addPage([600, 800])
    const data = new Uint8Array(await source.save())
    const pages: PageRef[] = [0, 1].map((sourceIndex) => ({
      id: `p${sourceIndex}`,
      sourceId: 's',
      sourceIndex,
      rotation: 0,
      annotations: [image(0)],
    }))
    const result = await buildPdf(pages, new Map([['s', { data }]]), {
      assets: new Map([['asset', { mimeType: 'image/png' as const, data: PNG }]]),
    })
    const doc = await PDFDocument.load(result)
    const xObjects = (pageIndex: number) =>
      doc.getPage(pageIndex).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)?.values()
    const first = xObjects(0)
    expect(first).toHaveLength(1)
    // Both pages point at the same embedded image object
    expect(xObjects(1)?.[0]).toBe(first?.[0])
  })
})
