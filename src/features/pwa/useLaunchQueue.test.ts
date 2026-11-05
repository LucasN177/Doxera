import { useUiStore } from '@/stores/uiStore'
import { handleLaunchedFiles } from './useLaunchQueue'

const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' })
const jpg = (name: string) => new File([new Uint8Array([0xff, 0xd8])], name, { type: 'image/jpeg' })

describe('files opened with the installed app', () => {
  beforeEach(() => {
    useUiStore.getState().setBatchFiles(null)
    useUiStore.getState().setImagesToPdf(null)
  })

  it('opens a single PDF', async () => {
    const open = vi.fn(async () => true)
    await handleLaunchedFiles([pdf('a.pdf')], open)
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ name: 'a.pdf' }))
  })

  it('hands several PDFs to batch processing and pictures to "Images to PDF"', async () => {
    const open = vi.fn(async () => true)
    await handleLaunchedFiles([pdf('a.pdf'), pdf('b.pdf')], open)
    expect(open).not.toHaveBeenCalled()
    expect(useUiStore.getState().batchFiles?.map((file) => file.name)).toEqual(['a.pdf', 'b.pdf'])

    await handleLaunchedFiles([jpg('foto.jpg')], open)
    expect(useUiStore.getState().imagesToPdf?.map((file) => file.name)).toEqual(['foto.jpg'])
  })
})
