import { looksLikeImage, readImageSize } from './images'

const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

/** Minimal JPEG header with a baseline SOF0 frame of 640×480. */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02,
  0x80, 0x03,
])

describe('readImageSize', () => {
  it('reads PNG and JPEG sizes from the header', () => {
    expect(readImageSize(PNG)).toEqual({ width: 1, height: 1 })
    expect(readImageSize(JPEG)).toEqual({ width: 640, height: 480 })
  })

  it('returns null for other formats', () => {
    expect(readImageSize(new TextEncoder().encode('RIFF....WEBP'))).toBeNull()
  })
})

describe('looksLikeImage', () => {
  it('accepts images by type or extension, including iPhone photos', () => {
    expect(looksLikeImage({ name: 'a.bin', type: 'image/png' })).toBe(true)
    expect(looksLikeImage({ name: 'IMG_0001.HEIC', type: '' })).toBe(true)
    expect(looksLikeImage({ name: 'doc.pdf', type: 'application/pdf' })).toBe(false)
  })
})
