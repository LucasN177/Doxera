import { toCsvFiles, toJson, toSheets, type DataContent, type DocumentData } from './dataExport'

export type DataFormat = 'xlsx' | 'json' | 'csv'

/** The export files for one document: one workbook, one JSON file or several CSV files. */
export async function buildDataFiles(
  data: DocumentData,
  content: DataContent,
  format: DataFormat,
  base: string,
): Promise<File[]> {
  if (format === 'json') {
    return [new File([toJson(data, content)], `${base}.json`, { type: 'application/json' })]
  }
  if (format === 'xlsx') {
    const { buildXlsx, XLSX_TYPE } = await import('./xlsx')
    const workbook = buildXlsx(toSheets(data, content))
    return [new File([workbook.slice()], `${base}.xlsx`, { type: XLSX_TYPE })]
  }
  return toCsvFiles(data, content, base).map(
    // BOM: Excel then reads the files as UTF-8 (umlauts, €)
    ({ name, text }) => new File(['\uFEFF', text], name, { type: 'text/csv;charset=utf-8' }),
  )
}
