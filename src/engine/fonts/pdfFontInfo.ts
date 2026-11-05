import type { PDFDict, PDFDocument, PDFFont, PDFObject, PDFRef } from 'pdf-lib'
import type { SourceFont } from '@/types/annotations'

export type { SourceFont }

type PdfLib = typeof import('pdf-lib')

/** What is needed to write new text with a font of an existing PDF. */
export interface PdfFontInfo {
  /** BaseFont without the subset prefix ("ABCDEF+"). */
  baseName: string
  /** Subset fonts only contain the glyphs the document uses. */
  subset: boolean
  /** Bytes per character code (1 for simple fonts, 2 for Identity-H). */
  bytes: 1 | 2
  /** Unicode code point → character code. */
  codes: Map<number, number>
  /** Character code → advance width in 1/1000 em. */
  widths: Map<number, number>
}

export function baseFontName(name: string): string {
  return name.replace(/^[A-Z]{6}\+/, '')
}

/** Code → Unicode code point from a ToUnicode CMap (single characters only). */
export function parseToUnicode(cmap: string): Map<number, number> {
  const result = new Map<number, number>()
  const hex = (value: string) => Number.parseInt(value, 16)
  const unicode = (value: string): number | null => {
    const units = value.match(/.{1,4}/g)?.map(hex) ?? []
    const text = String.fromCharCode(...units)
    const points = Array.from(text)
    return points.length === 1 ? points[0]!.codePointAt(0)! : null
  }
  for (const [, body] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, source, target] of body!.matchAll(/<([\da-fA-F]+)>\s*<([\da-fA-F]+)>/g)) {
      const point = unicode(target!)
      if (point !== null) result.set(hex(source!), point)
    }
  }
  for (const [, body] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const ranges = body!.matchAll(
      /<([\da-fA-F]+)>\s*<([\da-fA-F]+)>\s*(?:<([\da-fA-F]+)>|\[([^\]]*)\])/g,
    )
    for (const [, low, high, start, list] of ranges) {
      const from = hex(low!)
      const to = hex(high!)
      if (to - from > 0xffff) continue
      if (start) {
        const first = unicode(start)
        if (first === null) continue
        for (let code = from; code <= to; code++) result.set(code, first + code - from)
      } else {
        const targets = [...list!.matchAll(/<([\da-fA-F]+)>/g)].map((match) => match[1]!)
        targets.forEach((target, index) => {
          const point = unicode(target)
          if (point !== null && from + index <= to) result.set(from + index, point)
        })
      }
    }
  }
  return result
}

let winAnsi: { codeToUnicode: Map<number, number>; nameToUnicode: Map<string, number> } | null =
  null

/** WinAnsi codes and glyph names (from pdf-lib's standard font data). */
function winAnsiTables(lib: PdfLib) {
  if (winAnsi) return winAnsi
  const encoding = lib.StandardFontEmbedder.for(lib.StandardFonts.Helvetica as never).encoding
  const codeToUnicode = new Map<number, number>()
  const nameToUnicode = new Map<string, number>()
  for (const point of encoding.supportedCodePoints) {
    const { code, name } = encoding.encodeUnicodeCodePoint(point)
    codeToUnicode.set(code, point)
    nameToUnicode.set(name, point)
  }
  winAnsi = { codeToUnicode, nameToUnicode }
  return winAnsi
}

/** Unicode code point of a glyph name ("adieresis", "uni00E4", "u1F600"). */
function glyphUnicode(lib: PdfLib, name: string): number | null {
  const known = winAnsiTables(lib).nameToUnicode.get(name)
  if (known !== undefined) return known
  const match = /^uni([\dA-F]{4})$/.exec(name) ?? /^u([\dA-F]{4,6})$/.exec(name)
  return match ? Number.parseInt(match[1]!, 16) : null
}

function streamText(lib: PdfLib, object: PDFObject | undefined): string | null {
  if (!(object instanceof lib.PDFRawStream)) return null
  try {
    const bytes = lib.decodePDFRawStream(object).decode()
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return text
  } catch {
    return null
  }
}

/**
 * Reads how to write text with a font dictionary: Type0 fonts with
 * Identity-H encoding and a ToUnicode map, or simple fonts (Type1,
 * TrueType) with widths and a WinAnsi/Differences encoding or ToUnicode
 * map. Anything else (Type3, other CMaps, standard fonts without widths)
 * gives null.
 */
export function readFontInfo(lib: PdfLib, font: PDFDict): PdfFontInfo | null {
  const { PDFArray, PDFDict, PDFName, PDFNumber } = lib
  const name = (key: string) => PDFName.of(key)
  const subtype = font.lookup(name('Subtype'))
  const baseFont = font.lookup(name('BaseFont'))
  if (!(subtype instanceof PDFName) || !(baseFont instanceof PDFName)) return null
  const fullName = baseFont.decodeText()
  const info = {
    baseName: baseFontName(fullName),
    subset: /^[A-Z]{6}\+/.test(fullName),
    codes: new Map<number, number>(),
    widths: new Map<number, number>(),
  }
  const toUnicodeText = streamText(lib, font.lookup(name('ToUnicode')))
  const toUnicode = toUnicodeText ? parseToUnicode(toUnicodeText) : null
  const number = (object: PDFObject | undefined) =>
    object instanceof PDFNumber ? object.asNumber() : undefined

  if (subtype.decodeText() === 'Type0') {
    const encoding = font.lookup(name('Encoding'))
    if (!(encoding instanceof PDFName) || encoding.decodeText() !== 'Identity-H') return null
    if (!toUnicode) return null
    const descendants = font.lookup(name('DescendantFonts'))
    const cidFont = descendants instanceof PDFArray ? descendants.lookup(0) : undefined
    if (!(cidFont instanceof PDFDict)) return null
    const defaultWidth = number(cidFont.lookup(name('DW'))) ?? 1000
    const widths = new Map<number, number>()
    const w = cidFont.lookup(name('W'))
    if (w instanceof PDFArray) {
      for (let i = 0; i < w.size();) {
        const first = number(w.lookup(i))
        const next = w.lookup(i + 1)
        if (first === undefined) break
        if (next instanceof PDFArray) {
          for (let k = 0; k < next.size(); k++) {
            const width = number(next.lookup(k))
            if (width !== undefined) widths.set(first + k, width)
          }
          i += 2
        } else {
          const last = number(next)
          const width = number(w.lookup(i + 2))
          if (last === undefined || width === undefined) break
          for (let cid = first; cid <= last; cid++) widths.set(cid, width)
          i += 3
        }
      }
    }
    for (const [code, point] of toUnicode) {
      if (!info.codes.has(point)) info.codes.set(point, code)
      info.widths.set(code, widths.get(code) ?? defaultWidth)
    }
    return { ...info, bytes: 2 }
  }

  if (!['Type1', 'TrueType', 'MMType1'].includes(subtype.decodeText())) return null
  const firstChar = number(font.lookup(name('FirstChar')))
  const widths = font.lookup(name('Widths'))
  if (firstChar === undefined || !(widths instanceof PDFArray)) return null
  for (let i = 0; i < widths.size(); i++) {
    const width = number(widths.lookup(i))
    if (width !== undefined) info.widths.set(firstChar + i, width)
  }

  const codeToUnicode = new Map<number, number>()
  const encoding = font.lookup(name('Encoding'))
  const base =
    encoding instanceof PDFName
      ? encoding.decodeText()
      : encoding instanceof PDFDict
        ? (
            encoding.lookup(name('BaseEncoding')) as { decodeText?: () => string } | undefined
          )?.decodeText?.()
        : undefined
  if (base === 'WinAnsiEncoding') {
    for (const [code, point] of winAnsiTables(lib).codeToUnicode) codeToUnicode.set(code, point)
  }
  const differences = encoding instanceof PDFDict ? encoding.lookup(name('Differences')) : null
  if (differences instanceof PDFArray) {
    let code = 0
    for (let i = 0; i < differences.size(); i++) {
      const item = differences.lookup(i)
      if (item instanceof PDFNumber) code = item.asNumber()
      else if (item instanceof PDFName) {
        const point = glyphUnicode(lib, item.decodeText())
        if (point !== null) codeToUnicode.set(code, point)
        code++
      }
    }
  }
  // ToUnicode is what text extraction trusts: it wins
  if (toUnicode) for (const [code, point] of toUnicode) codeToUnicode.set(code, point)
  for (const [code, point] of codeToUnicode) {
    if (!info.widths.has(code) || info.codes.has(point)) continue
    info.codes.set(point, code)
  }
  return info.codes.size > 0 ? { ...info, bytes: 1 } : null
}

export interface PageFont {
  /** The font object, or the dictionary itself if it is stored directly. */
  object: PDFRef | PDFDict
  info: PdfFontInfo
}

/** The fonts of a page's resources that new text can be written with. */
export function pageFonts(lib: PdfLib, document: PDFDocument, pageIndex: number): PageFont[] {
  const { PDFDict, PDFName, PDFRef } = lib
  const page = document.getPages()[pageIndex]
  const fonts = page?.node.Resources()?.lookup(PDFName.of('Font'))
  if (!(fonts instanceof PDFDict)) return []
  const result: PageFont[] = []
  for (const [, value] of fonts.entries()) {
    const dict = value instanceof PDFRef ? document.context.lookup(value) : value
    if (!(dict instanceof PDFDict)) continue
    const info = readFontInfo(lib, dict)
    if (info) result.push({ object: value instanceof PDFRef ? value : dict, info })
  }
  return result
}

const ESTIMATED_SPACE = 270

/**
 * The best font of a page for lines set in `fontName`: the one that can
 * show most of the characters those lines use. For subset fonts only these
 * characters are known to exist; full fonts offer everything they encode.
 */
export function sourceFontFor(
  fonts: readonly PageFont[],
  fontName: string,
  usedText: string,
): SourceFont | null {
  const wanted = baseFontName(fontName)
  const used = new Set(Array.from(usedText).filter((char) => char.trim()))
  const candidates = fonts.filter((font) => font.info.baseName === wanted)
  let best: { font: PageFont; covered: number } | null = null
  for (const font of candidates) {
    const covered = [...used].filter((char) => font.info.codes.has(char.codePointAt(0)!)).length
    if (!best || covered > best.covered) best = { font, covered }
  }
  if (!best || best.covered === 0) return null
  const { info } = best.font
  const chars: string[] = []
  const widths: number[] = []
  for (const [point, code] of info.codes) {
    const char = String.fromCodePoint(point)
    if (!char.trim()) continue
    if (info.subset && !used.has(char)) continue
    chars.push(char)
    widths.push(info.widths.get(code) ?? 0)
  }
  const spaceCode = info.codes.get(32)
  const hasSpace = spaceCode !== undefined && (!info.subset || usedText.includes(' '))
  return {
    name: info.baseName,
    chars: chars.join(''),
    widths,
    space: hasSpace ? (info.widths.get(spaceCode) ?? ESTIMATED_SPACE) : ESTIMATED_SPACE,
    hasSpace,
  }
}

const lookups = new WeakMap<SourceFont, Map<string, number>>()

function widthTable(font: SourceFont): Map<string, number> {
  let table = lookups.get(font)
  if (!table) {
    table = new Map(Array.from(font.chars).map((char, index) => [char, font.widths[index] ?? 0]))
    lookups.set(font, table)
  }
  return table
}

/** Whether the font can show every character of a text (spaces and line breaks aside). */
export function sourceFontCovers(font: SourceFont, text: string): boolean {
  const table = widthTable(font)
  return Array.from(text).every((char) => !char.trim() || table.has(char))
}

/** Width of a text in points with the original font, or null if it lacks a character. */
export function measureSourceFont(font: SourceFont, text: string, size: number): number | null {
  const table = widthTable(font)
  let total = 0
  for (const char of text) {
    const width = char === ' ' ? font.space : table.get(char)
    if (width === undefined) return null
    total += width
  }
  return (total * size) / 1000
}

const copiedFonts = new WeakMap<PDFDocument, WeakMap<PDFRef | PDFDict, PDFRef>>()

/** Fonts of the original document that draw words one by one (no space glyph). */
export const wordByWordFonts = new WeakSet<PDFFont>()

/**
 * The original font of an edited text for a PDF being built: the font
 * dictionary is copied from the source document and wrapped so pdf-lib can
 * draw with it (character codes from its encoding, widths as stored). Null
 * if the font isn't found or lacks a character of the text.
 */
export function embedSourceFont(
  lib: PdfLib,
  output: PDFDocument,
  source: PDFDocument,
  pageIndex: number,
  font: SourceFont,
  text: string,
): PDFFont | null {
  if (!sourceFontCovers(font, text)) return null
  const needed = Array.from(text).filter((char) => char.trim())
  const match = pageFonts(lib, source, pageIndex).find(
    ({ info }) =>
      info.baseName === font.name &&
      needed.every((char) => info.codes.has(char.codePointAt(0)!)) &&
      (!font.hasSpace || info.codes.has(32)),
  )
  if (!match) return null
  const { info } = match
  // One copy of each font per built PDF, however many texts use it
  let copies = copiedFonts.get(output)
  if (!copies) {
    copies = new WeakMap()
    copiedFonts.set(output, copies)
  }
  let ref = copies.get(match.object)
  if (!ref) {
    const copied = lib.PDFObjectCopier.for(source.context, output.context).copy(match.object)
    ref = copied instanceof lib.PDFRef ? copied : output.context.register(copied)
    copies.set(match.object, ref)
  }

  const fontName = `Doxera${font.name.replace(/[^A-Za-z0-9]/g, '')}`
  const embedder = Object.create(lib.CustomFontEmbedder.prototype) as Record<string, unknown>
  Object.assign(embedder, {
    fontName,
    customName: undefined,
    font: { characterSet: [...needed.map((char) => char.codePointAt(0)!), 32] },
    encodeText(value: string) {
      const hex = Array.from(value)
        .map((char) => {
          const code = info.codes.get(char.codePointAt(0)!) ?? 0
          return code.toString(16).padStart(info.bytes * 2, '0')
        })
        .join('')
      return lib.PDFHexString.of(hex)
    },
    widthOfTextAtSize(value: string, size: number) {
      return measureSourceFont(font, value, size) ?? 0
    },
    heightOfFontAtSize(size: number) {
      return size
    },
    sizeOfFontAtHeight(height: number) {
      return height
    },
    async embedIntoContext() {
      // The dictionary was copied above
    },
  })
  const result = lib.PDFFont.of(ref, output, embedder as never)
  if (!font.hasSpace) wordByWordFonts.add(result)
  return result
}
