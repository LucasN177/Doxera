import {
  createPdfFile,
  downloadFile,
  ensurePdfExtension,
  isAppleMobile,
  saveFile,
} from './download'

const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({
  userAgent,
  platform,
  maxTouchPoints,
})

describe('isAppleMobile', () => {
  it('detects iPhone and iPad', () => {
    expect(isAppleMobile(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'))).toBe(true)
    expect(isAppleMobile(nav('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'))).toBe(true)
  })

  it('detects iPadOS posing as a Mac', () => {
    expect(
      isAppleMobile(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)),
    ).toBe(true)
  })

  it('does not match desktop Macs or other platforms', () => {
    expect(
      isAppleMobile(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)),
    ).toBe(false)
    expect(isAppleMobile(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 10))).toBe(false)
    expect(isAppleMobile(nav('Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5))).toBe(false)
  })
})

describe('ensurePdfExtension', () => {
  it('adds .pdf when missing', () => {
    expect(ensurePdfExtension('Rechnung')).toBe('Rechnung.pdf')
    expect(ensurePdfExtension('scan.PDF')).toBe('scan.PDF')
    expect(ensurePdfExtension('  ')).toBe('Dokument.pdf')
  })
})

describe('createPdfFile', () => {
  it('creates a PDF file with a copy of the bytes', async () => {
    const data = new Uint8Array([1, 2, 3])
    const file = createPdfFile(data, 'a')
    data[0] = 9
    expect(file.name).toBe('a.pdf')
    expect(file.type).toBe('application/pdf')
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([1, 2, 3])
  })
})

describe('saving', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  })

  it('downloads via a temporary link', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const file = createPdfFile(new Uint8Array([1]), 'x.pdf')

    expect(downloadFile(file)).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    click.mockRestore()
  })

  it('uses the share sheet on iPhone/iPad', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone)')
    const share = vi.fn(async () => {})
    Object.assign(navigator, { share, canShare: () => true })

    expect(await saveFile(createPdfFile(new Uint8Array([1]), 'x.pdf'))).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
  })

  it('reports a dismissed share sheet as cancelled', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPad)')
    const share = vi.fn(async () => {
      throw new DOMException('dismissed', 'AbortError')
    })
    Object.assign(navigator, { share, canShare: () => true })

    expect(await saveFile(createPdfFile(new Uint8Array([1]), 'x.pdf'))).toBe('cancelled')
  })
})
