import type { TextLine } from './structure'
import { bodyFontSize, structureLines, toMarkdown } from './structure'
import { findTables, tableToCsv, tableToTsv } from './tables'

/** A line made of cells at the given x positions (5.5 pt per character). */
function row(top: number, cells: Array<[number, string]>, size = 10): TextLine {
  const segments = cells.map(([left, text]) => ({ text, left, right: left + text.length * 5.5 }))
  return {
    text: cells.map(([, text]) => text).join(' '),
    left: segments[0].left,
    right: segments[segments.length - 1].right,
    top,
    bottom: top + size,
    size,
    bold: false,
    segments,
  }
}

const text = (top: number, value: string): TextLine => row(top, [[50, value]])

describe('findTables', () => {
  const lines = [
    text(40, 'Rechnung Nr. 4711'),
    row(80, [
      [50, 'Artikel'],
      [250, 'Menge'],
      [350, 'Preis'],
    ]),
    row(95, [
      [50, 'Schreibtisch'],
      [255, '1'],
      [345, '349,00'],
    ]),
    row(110, [
      [50, 'Bürostuhl, ergonomisch'],
      [255, '2'],
      [345, '2 × 189,00'],
    ]),
    // Wrapped cell
    text(122, 'mit Armlehnen'),
    row(137, [
      [50, 'Lampe'],
      [255, '3'],
      [350, '39,90'],
    ]),
    text(180, 'Zahlbar innerhalb von 14 Tagen.'),
  ]

  it('finds the rows and columns of a table', () => {
    const [table] = findTables(lines)
    expect(table.rows).toEqual([
      ['Artikel', 'Menge', 'Preis'],
      ['Schreibtisch', '1', '349,00'],
      ['Bürostuhl, ergonomisch mit Armlehnen', '2', '2 × 189,00'],
      ['Lampe', '3', '39,90'],
    ])
    expect(table.lines).toEqual([1, 2, 3, 4, 5])
  })

  it('groups cells stored column by column into rows', () => {
    // Some PDFs keep each cell as its own line, column after column
    const cell = (top: number, left: number, value: string) => row(top, [[left, value]])
    const columns = [
      cell(80, 50, 'Name'),
      cell(95, 50, 'Anna'),
      cell(110, 50, 'Ben'),
      cell(80, 200, 'Alter'),
      cell(95, 200, '34'),
      cell(110, 200, '41'),
    ]
    expect(findTables(columns)[0].rows).toEqual([
      ['Name', 'Alter'],
      ['Anna', '34'],
      ['Ben', '41'],
    ])
  })

  it('ignores ordinary text and short two-row layouts', () => {
    expect(findTables([text(40, 'Ein Absatz'), text(55, 'mit zwei Zeilen.')])).toEqual([])
    const twoRows = [
      row(80, [
        [50, 'Datum:'],
        [200, '04.11.2026'],
      ]),
      row(95, [
        [50, 'Kunde:'],
        [200, '1234'],
      ]),
    ]
    expect(findTables(twoRows)).toEqual([])
  })

  it('puts tables into the structured text', () => {
    const blocks = structureLines(lines, bodyFontSize(lines))
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'table', 'paragraph'])
    expect(toMarkdown([blocks])).toContain(
      '| Artikel | Menge | Preis |\n| --- | --- | --- |\n| Schreibtisch | 1 | 349,00 |',
    )
  })
})

describe('table output', () => {
  const rows = [
    ['Name', 'Notiz'],
    ['Müller; Anna', 'sagt "hallo"'],
  ]
  it('writes CSV with quoting', () => {
    expect(tableToCsv(rows)).toBe('Name;Notiz\r\n"Müller; Anna";"sagt ""hallo"""\r\n')
  })
  it('writes tab-separated rows', () => {
    expect(tableToTsv(rows)).toBe('Name\tNotiz\nMüller; Anna\tsagt "hallo"')
  })
})
