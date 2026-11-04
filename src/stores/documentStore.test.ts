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
  useDocumentStore.setState({ loading: false, document: null, pdf: null })
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
    expect(document).toMatchObject({ name: 'test.pdf', pageCount: 2 })
    expect(document?.pageSizes).toHaveLength(2)
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
