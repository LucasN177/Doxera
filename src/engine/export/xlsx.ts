import { strToU8, zipSync } from 'fflate'
import type { Cell, NumberFormat } from './cells'

export interface Sheet {
  name: string
  rows: Cell[][]
  /** First row is a header: bold and frozen when scrolling. */
  header?: boolean
}

/** Style indices in styles.xml (cellXfs). */
const STYLE = { text: 0, header: 1, integer: 2, decimal: 3, euro: 4, percent: 5 } as const
const FORMAT_STYLE: Record<NumberFormat, number> = {
  integer: STYLE.integer,
  decimal: STYLE.decimal,
  euro: STYLE.euro,
  percent: STYLE.percent,
}

function escapeXml(text: string): string {
  return (
    text
      // Control characters are not allowed in XML (tabs and line breaks are)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

/**
 * Sheet names: at most 31 characters, without : \ / ? * [ ], unique
 * (case-insensitive), as Excel requires.
 */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>()
  return names.map((raw) => {
    const base =
      raw
        .replace(/[:\\/?*[\]]/g, ' ')
        .trim()
        .slice(0, 31) || 'Blatt'
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` (${n})`
      name = base.slice(0, 31 - suffix.length) + suffix
    }
    used.add(name.toLowerCase())
    return name
  })
}

function cellXml(cell: Cell, ref: string, header: boolean): string {
  if (typeof cell === 'string') {
    if (!cell) return ''
    const style = header ? ` s="${STYLE.header}"` : ''
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`
  }
  return `<c r="${ref}" s="${FORMAT_STYLE[cell.format]}"><v>${cell.value}</v></c>`
}

function sheetXml(sheet: Sheet): string {
  const columns = Math.max(0, ...sheet.rows.map((row) => row.length))
  // Width from the longest text in a column (in characters), within reason
  const widths = Array.from({ length: columns }, (_, c) => {
    const longest = Math.max(
      0,
      ...sheet.rows.map((row) => {
        const cell = row[c]
        return typeof cell === 'string' ? cell.length : cell ? String(cell.value).length + 4 : 0
      }),
    )
    return Math.min(60, Math.max(8, longest + 2))
  })
  const cols = columns
    ? `<cols>${widths.map((width, c) => `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const frozen =
    sheet.header && sheet.rows.length > 1
      ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      : ''
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => cellXml(cell, `${columnName(c)}${r + 1}`, !!sheet.header && r === 0))
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${frozen}${cols}<sheetData>${rows}</sheetData></worksheet>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/**
 * Writes an Excel workbook (.xlsx, Office Open XML) with text cells inline
 * and number cells formatted (thousands separators, decimals, €, %).
 */
export function buildXlsx(sheets: readonly Sheet[]): Uint8Array {
  const list = sheets.length > 0 ? sheets : [{ name: 'Leer', rows: [] }]
  const names = sheetNames(list.map((sheet) => sheet.name))
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  }
  list.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet))
  })
  return zipSync(files, { level: 6 })
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
