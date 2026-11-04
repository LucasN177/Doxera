import { computePageLayout, findPageIndexAt, getVisibleRange } from './pageLayout'

const page = { width: 100, height: 200 }
// padding 10, gap 5 → tops: 10, 215, 420; total = 420 + 200 + 10
const layout = computePageLayout([page, page, { width: 300, height: 200 }], 1, 5, 10)

describe('computePageLayout', () => {
  it('stacks pages with gap and padding', () => {
    expect(layout.tops).toEqual([10, 215, 420])
    expect(layout.totalHeight).toBe(630)
    expect(layout.maxWidth).toBe(300)
  })

  it('applies the scale', () => {
    const scaled = computePageLayout([page], 2, 5, 10)
    expect(scaled.widths).toEqual([200])
    expect(scaled.heights).toEqual([400])
  })

  it('handles empty documents', () => {
    expect(computePageLayout([], 1, 5, 10).totalHeight).toBe(0)
  })
})

describe('findPageIndexAt', () => {
  it('finds the page containing a position', () => {
    expect(findPageIndexAt(layout, 0)).toBe(0)
    expect(findPageIndexAt(layout, 214)).toBe(0)
    expect(findPageIndexAt(layout, 215)).toBe(1)
    expect(findPageIndexAt(layout, 10_000)).toBe(2)
  })
})

describe('getVisibleRange', () => {
  it('returns all pages intersecting the range', () => {
    expect(getVisibleRange(layout, 0, 100)).toEqual({ first: 0, last: 0 })
    expect(getVisibleRange(layout, 100, 300)).toEqual({ first: 0, last: 1 })
  })

  it('skips a page that ends above the range (in the gap)', () => {
    expect(getVisibleRange(layout, 212, 300)).toEqual({ first: 1, last: 1 })
  })
})
