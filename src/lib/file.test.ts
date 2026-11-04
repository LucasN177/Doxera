import { formatFileSize, hasPdfSignature, looksLikePdf } from './file'

const encode = (text: string) => new TextEncoder().encode(text)

describe('looksLikePdf', () => {
  it('accepts PDF MIME type or extension', () => {
    expect(looksLikePdf({ name: 'a.pdf', type: '' })).toBe(true)
    expect(looksLikePdf({ name: 'A.PDF', type: '' })).toBe(true)
    expect(looksLikePdf({ name: 'download', type: 'application/pdf' })).toBe(true)
    expect(looksLikePdf({ name: 'image.png', type: 'image/png' })).toBe(false)
  })
})

describe('hasPdfSignature', () => {
  it('detects the header at the start', () => {
    expect(hasPdfSignature(encode('%PDF-1.7\n...'))).toBe(true)
  })

  it('detects the header after leading garbage', () => {
    expect(hasPdfSignature(encode(`${'x'.repeat(100)}%PDF-1.4`))).toBe(true)
  })

  it('rejects other content', () => {
    expect(hasPdfSignature(encode('hello world'))).toBe(false)
    expect(hasPdfSignature(new Uint8Array())).toBe(false)
  })
})

describe('formatFileSize', () => {
  it('uses suitable units', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1,5 MB')
  })
})
