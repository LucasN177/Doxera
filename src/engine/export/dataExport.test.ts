import { strFromU8, unzipSync } from 'fflate'
import { dataSummary, toCsvFiles, toJson, toSheets, type DocumentData } from './dataExport'
import { buildXlsx } from './xlsx'

const data: DocumentData = {
  name: 'Rechnung.pdf',
  pageCount: 2,
  pages: [
    {
      number: 1,
      blocks: [
        { type: 'heading', level: 1, text: 'Rechnung' },
        { type: 'paragraph', text: 'Vielen Dank.' },
        {
          type: 'table',
          rows: [
            ['Artikel', 'Preis'],
            ['Stuhl', '189,00 €'],
          ],
        },
      ],
    },
    {
      number: 2,
      blocks: [{ type: 'list', ordered: false, items: [{ marker: '•', text: 'Zahlbar sofort' }] }],
    },
  ],
  comments: [
    {
      page: 2,
      text: 'Bitte prüfen',
      color: '#facc15',
      createdAt: 1_790_000_000_000,
      updatedAt: 1_790_000_000_000,
    },
  ],
  highlights: [{ page: 1, type: 'highlight', text: 'Vielen Dank', color: '#facc15' }],
}
const all = { text: true, tables: true, comments: true, highlights: true }

describe('data export', () => {
  it('counts what there is', () => {
    expect(dataSummary(data)).toEqual({ blocks: 3, tables: 1, comments: 1, highlights: 1 })
  })

  it('writes JSON with the chosen content', () => {
    const json = JSON.parse(
      toJson(data, { text: false, tables: true, comments: true, highlights: true }),
    )
    expect(json.document).toMatchObject({ name: 'Rechnung.pdf', pages: 2 })
    expect(json.pages).toBeUndefined()
    expect(json.tables).toEqual([
      { page: 1, header: ['Artikel', 'Preis'], rows: [['Stuhl', '189,00 €']] },
    ])
    expect(json.comments[0]).toMatchObject({ page: 2, text: 'Bitte prüfen' })
    expect(json.comments[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(json.highlights).toEqual([
      { page: 1, type: 'highlight', text: 'Vielen Dank', color: '#facc15' },
    ])
  })

  it('makes sheets with numbers as numbers', () => {
    const sheets = toSheets(data, all)
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Text',
      'Tabelle 1 (S. 1)',
      'Kommentare',
      'Markierungen',
    ])
    // Comment dates are real date cells (days since 1899-12-30, local time)
    const created = sheets[2].rows[1][2] as { value: number; format: string }
    expect(created.format).toBe('datetime')
    const local = new Date(1_790_000_000_000)
    const serial =
      (Date.UTC(
        local.getFullYear(),
        local.getMonth(),
        local.getDate(),
        local.getHours(),
        local.getMinutes(),
        local.getSeconds(),
      ) -
        Date.UTC(1899, 11, 30)) /
      86_400_000
    expect(created.value).toBeCloseTo(serial, 6)
    expect(sheets[3].rows[1]).toEqual([
      { value: 1, format: 'integer' },
      'Hervorgehoben',
      'Vielen Dank',
    ])
    expect(sheets[0].rows[1]).toEqual([
      { value: 1, format: 'integer' },
      'Überschrift',
      { value: 1, format: 'integer' },
      'Rechnung',
    ])
    expect(sheets[1].rows[1]).toEqual(['Stuhl', { value: 189, format: 'euro' }])
    const files = unzipSync(buildXlsx(sheets))
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('<v>189</v>')
    expect(strFromU8(files['xl/worksheets/sheet3.xml'])).toMatch(/<c r="C2" s="6"><v>[\d.]+<\/v>/)
  })

  it('writes one CSV file per part', () => {
    const files = toCsvFiles(data, all, 'Rechnung')
    expect(files.map((file) => file.name)).toEqual([
      'Rechnung-text.csv',
      'Rechnung-tabelle-1.csv',
      'Rechnung-kommentare.csv',
      'Rechnung-markierungen.csv',
    ])
    expect(files[1].text).toBe('Artikel;Preis\r\nStuhl;189,00 €\r\n')
    expect(files[0].text).toContain('2;Listenpunkt;;• Zahlbar sofort')
  })
})
