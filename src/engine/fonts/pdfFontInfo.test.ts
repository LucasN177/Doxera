// @vitest-environment node
import fontkit from '@pdf-lib/fontkit'
import * as mupdf from 'mupdf'
import * as lib from 'pdf-lib'
import { buildPdf } from '@/engine/document/buildPdf'
import {
  replacementFor,
  toEditableLines,
  toEditableParagraphs,
} from '@/engine/document/contentEditing'
import { extractPageContent } from '@/engine/mupdf/pageContent'
import { applyRedactions } from '@/engine/mupdf/redact'
import type { PageRef } from '@/types/document'
import {
  measureSourceFont,
  pageFonts,
  parseToUnicode,
  readFontInfo,
  sourceFontFor,
} from './pdfFontInfo'

const { PDFDocument, PDFName } = lib

async function fontBytes(): Promise<Uint8Array> {
  const module = 'node:fs/promises'
  const { readFile } = (await import(/* @vite-ignore */ module)) as {
    readFile: (path: string) => Promise<Uint8Array>
  }
  return readFile('node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf')
}

/** A page set in an embedded subset font (Type0, Identity-H, with ToUnicode). */
async function embeddedFontPdf() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await fontBytes(), { subset: true })
  const page = pdf.addPage([600, 800])
  page.drawText('Der Mieter zahlt achthundert Euro.', { x: 60, y: 700, size: 14, font })
  return pdf.save()
}

/** MuPDF's lines with their font names. */
function fontLines(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    return extractPageContent(document, 0).lines.map((line) => [line.text, line.fontName])
  } finally {
    document.destroy()
  }
}

describe('fonts of existing PDFs', { timeout: 30_000 }, () => {
  it('reads ToUnicode maps (single codes and ranges)', () => {
    const cmap = `beginbfchar
<0003> <0020>
<0024> <00E4>
endbfchar
beginbfrange
<0010> <0012> <0041>
<0020> <0021> [<0078> <D83DDE00>]
endbfrange`
    const map = parseToUnicode(cmap)
    expect(map.get(3)).toBe(0x20)
    expect(map.get(0x24)).toBe(0xe4)
    expect([map.get(0x10), map.get(0x11), map.get(0x12)]).toEqual([0x41, 0x42, 0x43])
    expect(map.get(0x20)).toBe(0x78)
    expect(map.get(0x21)).toBe(0x1f600)
  })

  it('reads simple fonts with Differences', async () => {
    const pdf = await PDFDocument.create()
    const dict = pdf.context.obj({
      Type: 'Font',
      Subtype: 'Type1',
      BaseFont: 'ABCDEF+Garamond',
      FirstChar: 65,
      Widths: [600, 550, 500],
      Encoding: { Type: 'Encoding', Differences: [65, 'adieresis', 'germandbls', 'uni20AC'] },
    })
    const info = readFontInfo(lib, dict)!
    expect(info.baseName).toBe('Garamond')
    expect(info.subset).toBe(true)
    expect([...info.codes]).toEqual([
      [0xe4, 65],
      [0xdf, 66],
      [0x20ac, 67],
    ])
    expect(info.widths.get(67)).toBe(500)
  })

  it('knows the characters and widths of an embedded subset font', async () => {
    const data = await embeddedFontPdf()
    const loaded = await PDFDocument.load(data)
    const fonts = pageFonts(lib, loaded, 0)
    const [[text, fontName]] = fontLines(data) as [[string, string]]
    const font = sourceFontFor(fonts, fontName, text)!
    expect(font.name).toMatch(/^LiberationSans/)
    // Only what the page uses is known to be in the subset
    expect(font.chars).toContain('M')
    expect(font.chars).not.toContain('Q')
    expect(font.hasSpace).toBe(true)
    // Liberation Sans is metric compatible with Helvetica: "Euro" 0.667+0.556+0.333+0.556 em
    expect(measureSourceFont(font, 'Euro', 10)).toBeCloseTo(21.12, 1)
    expect(measureSourceFont(font, 'Quark', 10)).toBeNull()
    // Unused codes of the font aren't taken
    expect(loaded.getPage(0).node.Resources()?.lookup(PDFName.of('Font'))).toBeDefined()
  })

  async function exportEdit(newText: string) {
    const data = await embeddedFontPdf()
    const loaded = await PDFDocument.load(data)
    const document = new mupdf.PDFDocument(data)
    const raw = extractPageContent(document, 0)
    document.destroy()
    const [line] = toEditableParagraphs(toEditableLines(raw), { width: 600, height: 800 })
    const sourceFont = sourceFontFor(pageFonts(lib, loaded, 0), line!.fontName!, line!.text)!
    const replacement = { ...replacementFor({ ...line!, sourceFont }, 'edit'), text: newText }
    const page: PageRef = {
      id: 'p',
      sourceId: 's',
      sourceIndex: 0,
      rotation: 0,
      annotations: [replacement],
    }
    return buildPdf([page], new Map([['s', { data }]]), {
      redact: async (bytes, mode) => applyRedactions(mupdf, bytes, mode),
    })
  }

  it('writes edited text with the original font when it has every character', async () => {
    const lines = fontLines(await exportEdit('Der Mieter zahlt hundert Euro.'))
    expect(lines).toEqual([['Der Mieter zahlt hundert Euro.', expect.stringMatching(/Liberation/)]])
  })

  it('falls back to a standard font for characters the subset lacks', async () => {
    const lines = fontLines(await exportEdit('Der Mieter zahlt 900 Euro.'))
    expect(lines).toEqual([['Der Mieter zahlt 900 Euro.', expect.stringMatching(/Helvetica/)]])
  })
})
