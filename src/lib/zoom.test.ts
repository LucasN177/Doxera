import { clampZoom, computeFitScale, formatZoom, MAX_ZOOM, MIN_ZOOM, stepZoom } from './zoom'

const A4 = { width: 595, height: 842 }
const LANDSCAPE = { width: 842, height: 595 }

describe('clampZoom', () => {
  it('limits the scale to the supported range', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM)
    expect(clampZoom(100)).toBe(MAX_ZOOM)
    expect(clampZoom(1.3)).toBe(1.3)
  })
})

describe('stepZoom', () => {
  it('moves to the next preset', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
  })

  it('snaps in-between values to the nearest preset in that direction', () => {
    expect(stepZoom(1.1, 1)).toBe(1.25)
    expect(stepZoom(1.1, -1)).toBe(1)
  })

  it('stops at the limits', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(0.2, -1)).toBe(MIN_ZOOM)
  })
})

describe('computeFitScale', () => {
  it('fits the widest page into the available width', () => {
    const scale = computeFitScale(
      'fit-width',
      [A4, LANDSCAPE],
      { width: 842 + 48, height: 500 },
      24,
    )
    expect(scale).toBeCloseTo(1)
  })

  it('fits the whole first page for fit-page', () => {
    const scale = computeFitScale('fit-page', [A4], { width: 2000, height: 842 / 2 + 48 }, 24)
    expect(scale).toBeCloseTo(0.5)
  })

  it('falls back to 1 without pages or space', () => {
    expect(computeFitScale('fit-width', [], { width: 800, height: 600 }, 24)).toBe(1)
    expect(computeFitScale('fit-width', [A4], { width: 0, height: 0 }, 24)).toBe(1)
  })
})

describe('formatZoom', () => {
  it('formats as rounded percentage', () => {
    expect(formatZoom(1.234)).toBe('123 %')
  })
})
