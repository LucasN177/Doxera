import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TextLineRef } from './compare'

/** The text lines of every page of a PDF, as pdf.js reads them. */
export async function pdfTextLines(
  pdf: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
): Promise<TextLineRef[]> {
  const lines: TextLineRef[] = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const content = await page.getTextContent()
    let current = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      current += item.str
      if (item.hasEOL) {
        lines.push({ text: current, page: number - 1 })
        current = ''
      } else if (item.str && !item.str.endsWith(' ')) current += ' '
    }
    if (current.trim()) lines.push({ text: current, page: number - 1 })
    page.cleanup()
    onProgress?.(number, pdf.numPages)
  }
  return lines
}
