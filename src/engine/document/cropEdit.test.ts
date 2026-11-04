import { adjustCrop } from './cropEdit'
import { MIN_CROP_SIZE } from './pageOps'

const none = { top: 0, right: 0, bottom: 0, left: 0 }

/** Compares insets with a tolerance for floating point rounding. */
function expectInsets(actual: typeof none, expected: typeof none) {
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    expect(actual[side]).toBeCloseTo(expected[side])
  }
}

describe('adjustCrop', () => {
  it('moves single edges inwards', () => {
    expect(adjustCrop(none, 'n', 0, 0.1)).toEqual({ ...none, top: 0.1 })
    expect(adjustCrop(none, 's', 0, -0.2)).toEqual({ ...none, bottom: 0.2 })
    expect(adjustCrop(none, 'w', 0.3, 0)).toEqual({ ...none, left: 0.3 })
    expect(adjustCrop(none, 'e', -0.4, 0)).toEqual({ ...none, right: 0.4 })
  })

  it('moves two edges with a corner', () => {
    expect(adjustCrop(none, 'se', -0.1, -0.2)).toEqual({ ...none, right: 0.1, bottom: 0.2 })
  })

  it('stops at the page border', () => {
    expect(adjustCrop({ ...none, top: 0.1 }, 'n', 0, -0.5).top).toBe(0)
  })

  it('keeps a minimum visible size', () => {
    const crop = adjustCrop({ ...none, bottom: 0.5 }, 'n', 0, 0.9)
    expect(1 - crop.top - crop.bottom).toBeCloseTo(MIN_CROP_SIZE)
  })

  it('moves the whole frame without resizing and stops at the border', () => {
    const start = { top: 0.1, right: 0.2, bottom: 0.3, left: 0.4 }
    expectInsets(adjustCrop(start, 'move', 0.1, -0.05), {
      top: 0.05,
      right: 0.1,
      bottom: 0.35,
      left: 0.5,
    })
    const pushed = adjustCrop(start, 'move', 1, 1)
    expectInsets(pushed, { top: 0.4, right: 0, bottom: 0, left: 0.6 })
  })
})
