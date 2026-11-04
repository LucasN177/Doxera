import { PDFDocument } from 'pdf-lib'
import { uniqueFileNames } from '@/lib/deliverFiles'
import { mergeFiles, toPdfBytes } from './processors'

async function pdfFile(name: string, pages: number) {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < pages; i++) pdf.addPage([300, 400])
  return new File([(await pdf.save()).slice()], name, { type: 'application/pdf' })
}

describe('batch processing', () => {
  it('merges PDFs in order and reports broken files', async () => {
    const broken = new File(['kein pdf'], 'kaputt.pdf', { type: 'application/pdf' })
    const reports: Array<[number, boolean]> = []
    const merged = await mergeFiles(
      [await pdfFile('a.pdf', 2), broken, await pdfFile('b.pdf', 3)],
      (index, error) => reports.push([index, !!error]),
      new AbortController().signal,
    )
    expect(reports).toEqual([
      [0, false],
      [1, true],
      [2, false],
    ])
    const pdf = await PDFDocument.load(new Uint8Array(await merged!.arrayBuffer()))
    expect(pdf.getPageCount()).toBe(5)
  })

  it('rejects files that are neither PDF nor picture', async () => {
    await expect(toPdfBytes(new File(['x'], 'notiz.txt', { type: 'text/plain' }))).rejects.toThrow(
      'weder PDF noch Bild',
    )
  })

  it('numbers repeated output names', () => {
    const names = uniqueFileNames([
      new File([''], 'Bericht.pdf'),
      new File([''], 'bericht.pdf'),
      new File([''], 'Bericht.pdf'),
      new File([''], 'Notiz'),
    ]).map((file) => file.name)
    expect(names).toEqual(['Bericht.pdf', 'bericht (2).pdf', 'Bericht (3).pdf', 'Notiz'])
  })
})
