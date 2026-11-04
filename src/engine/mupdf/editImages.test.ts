// @vitest-environment node
import * as mupdf from 'mupdf'
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib'
import { buildPdf } from '@/engine/document/buildPdf'
import {
  imageReplacementFor,
  replacementFor,
  toEditableImages,
  toEditableLines,
} from '@/engine/document/contentEditing'
import type { PageRef } from '@/types/document'
import { extractImage, extractPageContent } from './pageContent'
import { applyRedactions } from './redact'

/** A page with two copies of one image (one turned) and a line of text. */
async function samplePdf() {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 40, 20], false)
  pixmap.clear(200)
  const png = pixmap.asPNG().slice()
  pixmap.destroy()
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(png)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([600, 800])
  page.drawImage(image, { x: 100, y: 500, width: 200, height: 100 })
  page.drawImage(image, { x: 300, y: 100, width: 100, height: 50, rotate: degrees(90) })
  page.drawText('Caption', { x: 100, y: 470, size: 12, font })
  return pdf.save()
}

function read(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    const content = extractPageContent(document, 0)
    let imageObjects = 0
    for (let i = 1; i < document.countObjects(); i++) {
      const object = document.newIndirect(i).resolve()
      if (object.isDictionary() && object.get('Subtype').isName()) {
        if (object.get('Subtype').asName() === 'Image') imageObjects++
      }
    }
    return { content, imageObjects }
  } finally {
    document.destroy()
  }
}

const options = {
  redact: async (bytes: Uint8Array, mode: 'redact' | 'text' | 'clean') =>
    applyRedactions(mupdf, bytes, mode),
}

describe('editing existing images', { timeout: 30_000 }, () => {
  it('finds images with their resource name, position and orientation', async () => {
    const { content } = read(await samplePdf())
    const images = toEditableImages(content)
    expect(images).toHaveLength(2)
    const [upright, turned] = images
    expect(upright.turns).toBe(0)
    expect(upright.rect.a.x).toBeCloseTo(100 / 600, 3)
    expect(upright.rect.a.y).toBeCloseTo(200 / 800, 3)
    expect(upright.rect.b.x).toBeCloseTo(300 / 600, 3)
    expect(turned.turns).toBe(1)
    expect(upright.xobject).not.toBe(turned.xobject)
  })

  it('extracts the pixels of an image', async () => {
    const document = new mupdf.PDFDocument(await samplePdf())
    const pixels = extractImage(mupdf, document, 0, 0)
    document.destroy()
    expect(pixels).toMatchObject({ mimeType: 'image/png', width: 40, height: 20 })
  })

  it('moves one image and removes the other on export; the old data is dropped', async () => {
    const data = await samplePdf()
    const [upright, turned] = toEditableImages(read(data).content)
    const moved = imageReplacementFor(upright, 'asset', 'm')
    moved.a = { x: 0.5, y: 0.5 }
    moved.b = { x: 0.5 + 200 / 600, y: 0.5 + 100 / 800 }
    const removed = { ...imageReplacementFor(turned, 'asset', 'r'), removed: true }
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 0,
      annotations: [moved, removed],
    }
    const pixels = new mupdf.PDFDocument(data)
    const asset = extractImage(mupdf, pixels, 0, 0)
    pixels.destroy()

    const result = await buildPdf([page], new Map([['s', { data }]]), {
      ...options,
      assets: new Map([['asset', asset]]),
    })
    const { content, imageObjects } = read(result)
    expect(content.images).toHaveLength(1)
    expect(content.images[0].bbox.map(Math.round)).toEqual([300, 400, 500, 500])
    // Only the newly placed image remains in the file
    expect(imageObjects).toBe(1)
    expect(content.lines.map((line) => line.text)).toEqual(['Caption'])
  })

  it('combines with edited text on the same page', async () => {
    const data = await samplePdf()
    const { content } = read(data)
    const [upright] = toEditableImages(content)
    const [caption] = toEditableLines(content)
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 0,
      annotations: [
        { ...imageReplacementFor(upright, 'asset', 'm'), removed: true },
        { ...replacementFor(caption, 't'), text: 'New caption' },
      ],
    }
    const result = await buildPdf([page], new Map([['s', { data }]]), options)
    const after = read(result).content
    expect(after.images).toHaveLength(1)
    expect(after.lines.map((line) => line.text)).toEqual(['New caption'])
  })
})

describe('tables in a real PDF', { timeout: 30_000 }, () => {
  it('reads a table stored column by column into rows and columns', async () => {
    const { pageTextLines } = await import('@/engine/text/pageText')
    const { structureLines, bodyFontSize } = await import('@/engine/text/structure')
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([600, 800])
    page.drawText('Preisliste', { x: 50, y: 740, size: 18, font })
    const columns = [
      ['Produkt', 'Apfel', 'Birne', 'Kirsche'],
      ['Menge', '10', '4', '250'],
      ['Preis', '2,50 €', '1,80 €', '7,00 €'],
    ]
    columns.forEach((column, c) =>
      column.forEach((value, r) =>
        page.drawText(value, { x: 50 + c * 150, y: 700 - r * 18, size: 11, font }),
      ),
    )
    const document = new mupdf.PDFDocument(await pdf.save())
    const content = extractPageContent(document, 0)
    document.destroy()
    const lines = pageTextLines(
      toEditableLines(content),
      { id: 'p', sourceId: 's', sourceIndex: 0, rotation: 0 },
      { width: 600, height: 800 },
    )
    const blocks = structureLines(lines, bodyFontSize(lines))
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Preisliste' })
    expect(blocks[1]).toEqual({
      type: 'table',
      rows: [
        ['Produkt', 'Menge', 'Preis'],
        ['Apfel', '10', '2,50 €'],
        ['Birne', '4', '1,80 €'],
        ['Kirsche', '250', '7,00 €'],
      ],
    })
  })
})
