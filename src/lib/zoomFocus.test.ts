import { computePageLayout } from './pageLayout'
import { MAX_ZOOM, MIN_ZOOM } from './zoom'
import { contentWidth, limitPinchRatio, scrollForFocalPoint } from './zoomFocus'

const PADDING = 24
const GAP = 16
const pages = Array.from({ length: 5 }, () => ({ width: 600, height: 800 }))
const at = (scale: number) => computePageLayout(pages, scale, GAP, PADDING)

describe('scrollForFocalPoint', () => {
  it('keeps the point under the fingers when zooming in', () => {
    const before = at(1)
    const after = at(2)
    const clientWidth = 1000
    // Point in the middle of page 3, 300px from the top of the visible area
    const contentY = before.tops[2] + 400
    const contentX = contentWidth(before, PADDING, clientWidth) / 2 + 100
    const result = scrollForFocalPoint(
      before,
      after,
      2,
      { contentX, contentY, viewportX: 600, viewportY: 300 },
      clientWidth,
      PADDING,
    )

    // Same spot of page 3 (its middle) must now be 300px below the viewport top
    expect(result.scrollTop + 300).toBeCloseTo(after.tops[2] + 800)
    // 100px right of center became 200px right of the new center
    expect(result.scrollLeft + 600).toBeCloseTo(contentWidth(after, PADDING, clientWidth) / 2 + 200)
  })

  it('never returns negative scroll positions', () => {
    const result = scrollForFocalPoint(
      at(2),
      at(0.5),
      0.25,
      { contentX: 10, contentY: 10, viewportX: 500, viewportY: 500 },
      1000,
      PADDING,
    )
    expect(result).toEqual({ scrollTop: 0, scrollLeft: 0 })
  })
})

describe('limitPinchRatio', () => {
  it('passes normal ratios through', () => {
    expect(limitPinchRatio(1, 1.5)).toBe(1.5)
  })

  it('stops at the zoom limits', () => {
    expect(limitPinchRatio(2, 10)).toBe(MAX_ZOOM / 2)
    expect(limitPinchRatio(1, 0.01)).toBe(MIN_ZOOM)
  })

  it('ignores invalid values', () => {
    expect(limitPinchRatio(1, Number.NaN)).toBe(1)
    expect(limitPinchRatio(1, 0)).toBe(1)
  })
})
