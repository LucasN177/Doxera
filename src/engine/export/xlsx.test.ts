import { strFromU8, unzipSync } from 'fflate'
import { toCell } from './cells'
import { buildXlsx, columnName, sheetNames } from './xlsx'

describe('toCell', () => {
  it.each([
    ['349,00', { value: 349, format: 'decimal' }],
    ['1.500,00 €', { value: 1500, format: 'euro' }],
    ['€ 2,50', { value: 2.5, format: 'euro' }],
    ['1,234.75', { value: 1234.75, format: 'decimal' }],
    ['12', { value: 12, format: 'integer' }],
    ['1.234', { value: 1234, format: 'integer' }],
    ['-3,5', { value: -3.5, format: 'decimal' }],
    ['19 %', { value: 0.19, format: 'percent' }],
    ['2.500.000', { value: 2500000, format: 'integer' }],
  ])('reads %s as a number', (text, expected) => {
    expect(toCell(text)).toEqual(expected)
  })

  it.each(['04.11.2026', '10115', '0049 30 1234', '12 mm', 'Apfel', '1.23.4', '21,4 °C', ''])(
    'keeps %s as text',
    (text) => {
      const cell = toCell(text)
      // Postal codes without leading zero are numbers; the rest stays text
      if (text === '10115') expect(cell).toEqual({ value: 10115, format: 'integer' })
      else expect(cell).toBe(text)
    },
  )
})

describe('buildXlsx', () => {
  it('writes a valid workbook structure with inline text and formatted numbers', () => {
    const data = buildXlsx([
      {
        name: 'Tabelle 1 (S. 2)',
        header: true,
        rows: [
          ['Artikel', 'Preis'],
          ['Stuhl <Eiche> & "Leder"', { value: 189, format: 'euro' }],
        ],
      },
      { name: 'Text', rows: [['Hallo']] },
    ])
    const files = unzipSync(data)
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ])
    const workbook = strFromU8(files['xl/workbook.xml'])
    expect(workbook).toContain('<sheet name="Tabelle 1 (S. 2)" sheetId="1" r:id="rId1"/>')
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain(
      '<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Artikel</t></is></c>',
    )
    expect(sheet).toContain('Stuhl &lt;Eiche&gt; &amp; &quot;Leder&quot;')
    expect(sheet).toContain('<c r="B2" s="4"><v>189</v></c>')
    expect(sheet).toContain('state="frozen"')
    // Every part is well-formed XML
    for (const [name, content] of Object.entries(files)) {
      const parsed = new DOMParser().parseFromString(strFromU8(content), 'application/xml')
      expect(parsed.getElementsByTagName('parsererror'), name).toHaveLength(0)
    }
  })

  it('names columns and sheets the way Excel expects', () => {
    expect([0, 25, 26, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA'])
    expect(sheetNames(['Text', 'text', 'A/B:C?', 'x'.repeat(40)])).toEqual([
      'Text',
      'text (2)',
      'A B C',
      'x'.repeat(31),
    ])
  })
})
