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
}
const all = { text: true, tables: true, comments: true }

describe('data export', () => {
  it('counts what there is', () => {
    expect(dataSummary(data)).toEqual({ blocks: 3, tables: 1, comments: 1 })
  })

  it('writes JSON with the chosen content', () => {
    const json = JSON.parse(toJson(data, { text: false, tables: true, comments: true }))
    expect(json.document).toMatchObject({ name: 'Rechnung.pdf', pages: 2 })
    expect(json.pages).toBeUndefined()
    expect(json.tables).toEqual([
      { page: 1, header: ['Artikel', 'Preis'], rows: [['Stuhl', '189,00 €']] },
    ])
    expect(json.comments[0]).toMatchObject({ page: 2, text: 'Bitte prüfen' })
    expect(json.comments[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('makes sheets with numbers as numbers', () => {
    const sheets = toSheets(data, all)
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Text', 'Tabelle 1 (S. 1)', 'Kommentare'])
    expect(sheets[0].rows[1]).toEqual([
      { value: 1, format: 'integer' },
      'Überschrift',
      { value: 1, format: 'integer' },
      'Rechnung',
    ])
    expect(sheets[1].rows[1]).toEqual(['Stuhl', { value: 189, format: 'euro' }])
    const files = unzipSync(buildXlsx(sheets))
    expect(strFromU8(files['xl/worksheets/sheet2.xml'])).toContain('<v>189</v>')
  })

  it('writes one CSV file per part', () => {
    const files = toCsvFiles(data, all, 'Rechnung')
    expect(files.map((file) => file.name)).toEqual([
      'Rechnung-text.csv',
      'Rechnung-tabelle-1.csv',
      'Rechnung-kommentare.csv',
    ])
    expect(files[1].text).toBe('Artikel;Preis\r\nStuhl;189,00 €\r\n')
    expect(files[0].text).toContain('2;Listenpunkt;;• Zahlbar sofort')
  })
})
