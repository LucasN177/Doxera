import type { PDFDocumentProxy } from 'pdfjs-dist'
import { closePdf, getPageSizes, openPdf, PdfLoadError } from '@/engine/render/pdfjs'
import { useDocumentStore } from './documentStore'

vi.mock('@/engine/render/pdfjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/render/pdfjs')>()
  return {
    PdfLoadError: actual.PdfLoadError,
    openPdf: vi.fn(),
    getPageSizes: vi.fn(),
    closePdf: vi.fn(),
  }
})

const fakePdf = (numPages: number) => ({ numPages }) as unknown as PDFDocumentProxy
const pdfFile = (name = 'test.pdf', content = '%PDF-1.7\n') =>
  new File([content], name, { type: 'application/pdf' })

beforeEach(() => {
  vi.mocked(openPdf).mockReset()
  vi.mocked(getPageSizes).mockReset()
  vi.mocked(closePdf).mockReset()
  useDocumentStore.getState().close()
})

/** Opens a document with `pageCount` A4 pages. */
async function openDocument(pageCount = 3) {
  vi.mocked(openPdf).mockResolvedValueOnce(fakePdf(pageCount))
  vi.mocked(getPageSizes).mockResolvedValueOnce(
    Array.from({ length: pageCount }, () => ({ width: 595, height: 842 })),
  )
  await useDocumentStore.getState().openFile(pdfFile())
}

const pageOrder = () => useDocumentStore.getState().document!.pages.map((page) => page.sourceIndex)

describe('documentStore editing', () => {
  it('applies edits and undoes/redoes them', async () => {
    await openDocument(3)
    const { edit, undo, redo } = useDocumentStore.getState()

    edit((pages) => [...pages].reverse())
    expect(pageOrder()).toEqual([2, 1, 0])
    edit((pages) => pages.slice(1))
    expect(pageOrder()).toEqual([1, 0])

    undo()
    expect(pageOrder()).toEqual([2, 1, 0])
    undo()
    expect(pageOrder()).toEqual([0, 1, 2])
    undo() // nothing left to undo
    expect(pageOrder()).toEqual([0, 1, 2])

    redo()
    expect(pageOrder()).toEqual([2, 1, 0])
    expect(useDocumentStore.getState().history.future).toHaveLength(1)
  })

  it('drops the redo stack after a new edit', async () => {
    await openDocument(2)
    const { edit, undo } = useDocumentStore.getState()
    edit((pages) => pages.slice(1))
    undo()
    edit((pages) => [...pages].reverse())
    expect(useDocumentStore.getState().history.future).toEqual([])
  })

  it('refuses edits that would leave no pages', async () => {
    await openDocument(2)
    expect(useDocumentStore.getState().edit(() => [])).toBe(false)
    expect(pageOrder()).toEqual([0, 1])
    expect(useDocumentStore.getState().history.past).toEqual([])
  })

  it('does not record no-op edits', async () => {
    await openDocument(2)
    useDocumentStore.getState().edit((pages) => pages)
    expect(useDocumentStore.getState().history.past).toEqual([])
  })

  it('inserts pages of other PDFs as one undoable step', async () => {
    await openDocument(2)
    vi.mocked(openPdf).mockResolvedValueOnce(fakePdf(3))
    vi.mocked(getPageSizes).mockResolvedValueOnce(
      Array.from({ length: 3 }, () => ({ width: 100, height: 100 })),
    )

    const result = await useDocumentStore
      .getState()
      .insertFiles([pdfFile('extra.pdf'), new File(['x'], 'notes.txt')], 1)

    expect(result.pages).toBe(3)
    expect(result.errors).toEqual([expect.stringContaining('notes.txt')])
    const { document, sources } = useDocumentStore.getState()
    expect(sources.size).toBe(2)
    expect(document!.pages.map((page) => page.sourceId === document!.primarySourceId)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ])

    useDocumentStore.getState().undo()
    expect(pageOrder()).toEqual([0, 1])
  })

  it('clears history when another document is opened', async () => {
    await openDocument(2)
    useDocumentStore.getState().edit((pages) => pages.slice(1))
    await openDocument(2)
    expect(useDocumentStore.getState().history).toEqual({ past: [], future: [] })
  })
})

describe('documentStore.openFile', () => {
  it('opens a valid PDF', async () => {
    const pdf = fakePdf(2)
    vi.mocked(openPdf).mockResolvedValue(pdf)
    vi.mocked(getPageSizes).mockResolvedValue([
      { width: 595, height: 842 },
      { width: 595, height: 842 },
    ])

    const result = await useDocumentStore.getState().openFile(pdfFile())

    expect(result).toEqual({ ok: true })
    const { document, loading } = useDocumentStore.getState()
    expect(loading).toBe(false)
    expect(document).toMatchObject({ name: 'test.pdf' })
    expect(document?.pages.map((page) => page.sourceIndex)).toEqual([0, 1])
    expect(useDocumentStore.getState().sources.get(document!.primarySourceId)?.pdf).toBe(pdf)
  })

  it('rejects non-PDF files without loading them', async () => {
    const result = await useDocumentStore
      .getState()
      .openFile(new File(['x'], 'photo.png', { type: 'image/png' }))

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('keine PDF') })
    expect(openPdf).not.toHaveBeenCalled()
  })

  it('rejects files without PDF signature', async () => {
    const result = await useDocumentStore.getState().openFile(pdfFile('fake.pdf', 'not a pdf'))
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('keine gültige') })
  })

  it('keeps the current document when opening another one fails', async () => {
    vi.mocked(openPdf).mockResolvedValueOnce(fakePdf(1))
    vi.mocked(getPageSizes).mockResolvedValue([{ width: 1, height: 1 }])
    await useDocumentStore.getState().openFile(pdfFile('first.pdf'))

    vi.mocked(openPdf).mockRejectedValueOnce(new PdfLoadError('password', 'Passwort'))
    const result = await useDocumentStore.getState().openFile(pdfFile('second.pdf'))

    expect(result).toEqual({ ok: false, message: 'Passwort' })
    expect(useDocumentStore.getState().document?.name).toBe('first.pdf')
  })

  it('releases the previous document when a new one is opened', async () => {
    const first = fakePdf(1)
    vi.mocked(openPdf).mockResolvedValueOnce(first).mockResolvedValueOnce(fakePdf(1))
    vi.mocked(getPageSizes).mockResolvedValue([{ width: 1, height: 1 }])

    await useDocumentStore.getState().openFile(pdfFile('first.pdf'))
    await useDocumentStore.getState().openFile(pdfFile('second.pdf'))

    expect(closePdf).toHaveBeenCalledWith(first)
  })

  it('discards a load that finished after the document was closed', async () => {
    let resolve!: (pdf: PDFDocumentProxy) => void
    vi.mocked(openPdf).mockReturnValue(new Promise((r) => (resolve = r)))
    vi.mocked(getPageSizes).mockResolvedValue([{ width: 1, height: 1 }])

    const pending = useDocumentStore.getState().openFile(pdfFile())
    await vi.waitFor(() => expect(openPdf).toHaveBeenCalled())
    useDocumentStore.getState().close()
    const late = fakePdf(1)
    resolve(late)

    expect(await pending).toMatchObject({ ok: false, cancelled: true })
    expect(useDocumentStore.getState().document).toBeNull()
    expect(closePdf).toHaveBeenCalledWith(late)
  })
})
