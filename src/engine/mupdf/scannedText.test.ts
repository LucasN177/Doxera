// @vitest-environment node
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

describe('editing scanned text', { timeout: 30_000 }, () => {
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
