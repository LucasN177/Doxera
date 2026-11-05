// @vitest-environment node
import { zlibSync } from 'fflate'
import * as mupdf from 'mupdf'
import {
  beginText,
  endText,
  moveText,
  PDFDocument,
  rgb,
  setFontAndSize,
  setTextRenderingMode,
  showText,
  StandardFonts,
  TextRenderingMode,
} from 'pdf-lib'
import { buildPdf } from '@/engine/document/buildPdf'
import { replacementFor, toEditableLines } from '@/engine/document/contentEditing'
import type { PageRef } from '@/types/document'
import { extractPageContent } from './pageContent'
import { applyRedactions } from './redact'

/** A "scan": a gray area standing in for the image, with recognized (invisible) text on it. */
async function scanPdf() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([600, 800])
  page.drawRectangle({ x: 0, y: 0, width: 600, height: 800, color: rgb(0.95, 0.95, 0.9) })
  page.drawText('Sichtbarer Text', { x: 60, y: 740, size: 14, font })
  const key = page.node.newFontDictionary(font.name, font.ref)
  page.pushOperators(
    beginText(),
    setTextRenderingMode(TextRenderingMode.Invisible),
    setFontAndSize(key, 14),
    moveText(60, 700),
    showText(font.encodeText('Erkannter Text')),
    endText(),
  )
  return pdf.save()
}

function readLines(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    return toEditableLines(extractPageContent(document, 0, mupdf))
  } finally {
    document.destroy()
  }
}

function pageContentText(data: Uint8Array): string {
  const document = new mupdf.PDFDocument(data)
  try {
    const page = document.loadPage(0)
    const contents = page.getObject().get('Contents')
    const streams = contents.isArray()
      ? Array.from({ length: contents.length }, (_, i) => contents.get(i))
      : [contents]
    return streams.map((stream) => stream.readStream().asString()).join('\n')
  } finally {
    document.destroy()
  }
}

/** A gray PNG (8-bit gray, no filter) with dark "ink" rows, written by hand. */
function grayPng(width: number, height: number, ink: (x: number, y: number) => boolean) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    out.set(
      Array.from(type, (char) => char.charCodeAt(0)),
      4,
    )
    out.set(data, 8)
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
    return out
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 0, 0, 0, 0], 8)
  const raw = new Uint8Array((width + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = ink(x, y) ? 30 : 235
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

/** Gray value of the scan image (first image of the page) at a pixel. */
function scanPixel(data: Uint8Array, x: number, y: number): number {
  const document = new mupdf.PDFDocument(data)
  try {
    const page = document.loadPage(0)
    const text = page.toStructuredText('preserve-images')
    let value = -1
    text.walk({
      onImageBlock(_bbox, _transform, image) {
        if (value >= 0) return
        const pixmap = image.toPixmap()
        const components = pixmap.getNumberOfComponents() + (pixmap.getAlpha() ? 1 : 0)
        value = pixmap.getPixels()[y * pixmap.getStride() + x * components]!
        pixmap.destroy()
      },
    })
    text.destroy()
    return value
  } finally {
    document.destroy()
  }
}

describe('editing scanned text', { timeout: 30_000 }, () => {
  it('removes the scan pixels below an edited line from the file', async () => {
    // 60 × 80 px scan on a 600 × 800 pt page: 10 pt per pixel; ink in rows 9–10 (y 90–110 pt)
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.addPage([600, 800])
    const scan = await pdf.embedPng(
      grayPng(60, 80, (x, y) => (y === 9 || y === 10) && x >= 6 && x < 20),
    )
    page.drawImage(scan, { x: 0, y: 0, width: 600, height: 800 })
    const key = page.node.newFontDictionary(font.name, font.ref)
    page.pushOperators(
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setFontAndSize(key, 14),
      moveText(60, 800 - 106),
      showText(font.encodeText('Erkannter Text')),
      endText(),
    )
    const data = await pdf.save()
    expect(scanPixel(data, 10, 10)).toBe(30)

    const line = readLines(data).find((item) => item.invisible)!
    const replacement = { ...replacementFor(line, 'edit'), text: 'Neu' }
    const result = await buildPdf(
      [{ id: 'p', sourceId: 's', sourceIndex: 0, rotation: 0, annotations: [replacement] }],
      new Map([['s', { data }]]),
      { redact: async (bytes, mode) => applyRedactions(mupdf, bytes, mode) },
    )
    // The ink below the line is gone from the image itself, the rest is untouched
    expect(scanPixel(result, 10, 10)).not.toBe(30)
    expect(scanPixel(result, 30, 40)).toBe(235)
  })

  it('tells recognized (invisible) text from visible text', async () => {
    const lines = readLines(await scanPdf())
    expect(lines.map((line) => [line.text, !!line.invisible])).toEqual([
      ['Sichtbarer Text', false],
      ['Erkannter Text', true],
    ])
  })

  it('paints over the scanned line and writes the new text', async () => {
    const data = await scanPdf()
    const line = readLines(data).find((item) => item.invisible)!
    const replacement = { ...replacementFor(line, 'edit'), text: 'Korrigierter Text' }
    expect(replacement.coverOriginal).toBe(true)
    replacement.cover = '#f2f2e6'
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
    const texts = readLines(result).map((item) => item.text)
    expect(texts).toContain('Korrigierter Text')
    expect(texts).not.toContain('Erkannter Text')
    expect(texts).toContain('Sichtbarer Text')
    // A filled rectangle in the cover color is drawn before the new text
    const content = pageContentText(result)
    expect(content).toMatch(/0?\.949\d* 0?\.949\d* 0?\.90\d* rg[\s\S]*\sh\s+f\s[\s\S]*Tj/)
  })
})
