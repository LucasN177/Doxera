import { getOutputScale, MAX_CANVAS_PIXELS } from './pdfjs'

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

const A4 = { width: 595, height: 842 }

describe('getOutputScale', () => {
  it('uses the device pixel ratio for sharp rendering', () => {
    expect(getOutputScale(A4.width, A4.height, 1.5, 2)).toBe(3)
  })

  it('caps the pixel ratio at 2', () => {
    expect(getOutputScale(A4.width, A4.height, 1, 3)).toBe(2)
  })

  it('keeps the canvas below the iOS size limit at high zoom', () => {
    const scale = getOutputScale(A4.width, A4.height, 5, 2)
    expect(scale).toBeLessThan(10)
    const pixels = A4.width * scale * A4.height * scale
    expect(pixels).toBeLessThanOrEqual(MAX_CANVAS_PIXELS)
    expect(pixels).toBeGreaterThan(MAX_CANVAS_PIXELS * 0.99)
  })
})
