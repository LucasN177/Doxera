import { degrees, PDFDocument, StandardFonts } from 'pdf-lib'
import type { PageRef, Rotation } from '@/types/document'
import { buildPdf } from './buildPdf'

/** A PDF whose pages have distinct widths (100, 101, …) so they can be told apart. */
async function makePdf(pageCount: number, firstWidth = 100, rotate = 0) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([firstWidth + i, 500])
    page.drawText(`Page ${i + 1}`, { x: 10, y: 10, size: 12, font })
    if (rotate) page.setRotation(degrees(rotate))
  }
  return new Uint8Array(await doc.save())
}

const ref = (sourceId: string, sourceIndex: number, rotation: Rotation = 0): PageRef => ({
  id: crypto.randomUUID(),
  sourceId,
  sourceIndex,
  rotation,
})

async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((page) => ({
    width: Math.round(page.getWidth()),
    rotation: page.getRotation().angle,
  }))
}

describe('buildPdf', () => {
  it('reorders, deletes and rotates pages', async () => {
    const sources = new Map([['a', { data: await makePdf(3) }]])
    const result = await buildPdf([ref('a', 2), ref('a', 0, 90)], sources, { title: 'Test' })

    expect(await inspect(result)).toEqual([
      { width: 102, rotation: 0 },
      { width: 100, rotation: 90 },
    ])
    expect((await PDFDocument.load(result)).getTitle()).toBe('Test')
  })

  it('adds the extra rotation to the page’s own rotation', async () => {
    const sources = new Map([['a', { data: await makePdf(1, 100, 90) }]])
    expect(await inspect(await buildPdf([ref('a', 0, 270)], sources))).toEqual([
      { width: 100, rotation: 0 },
    ])
  })

  it('duplicates pages', async () => {
    const sources = new Map([['a', { data: await makePdf(2) }]])
    const result = await buildPdf([ref('a', 0), ref('a', 0, 180), ref('a', 1)], sources)
    expect(await inspect(result)).toEqual([
      { width: 100, rotation: 0 },
      { width: 100, rotation: 180 },
      { width: 101, rotation: 0 },
    ])
  })

  it('merges pages from several sources', async () => {
    const sources = new Map([
      ['a', { data: await makePdf(2, 100) }],
      ['b', { data: await makePdf(2, 200) }],
    ])
    const result = await buildPdf([ref('a', 0), ref('b', 1), ref('a', 1)], sources)
    expect((await inspect(result)).map((p) => p.width)).toEqual([100, 201, 101])
  })

  it('rejects empty documents and missing sources', async () => {
    await expect(buildPdf([], new Map())).rejects.toThrow()
    await expect(buildPdf([ref('x', 0)], new Map())).rejects.toThrow()
  })
})

describe('buildPdf cropping', () => {
  it('writes the crop as CropBox in unrotated page space', async () => {
    const sources = new Map([['a', { data: await makePdf(1, 100) }]])
    const page: PageRef = { ...ref('a', 0), crop: { top: 0.1, right: 0, bottom: 0.2, left: 0.5 } }
    const doc = await PDFDocument.load(await buildPdf([page], sources))
    const box = doc.getPage(0).getCropBox()
    expect(box).toEqual({ x: 50, y: 100, width: 50, height: 350 })
    // The full page (MediaBox) stays intact, so the crop can be undone later
    expect(doc.getPage(0).getMediaBox()).toMatchObject({ width: 100, height: 500 })
  })
})
