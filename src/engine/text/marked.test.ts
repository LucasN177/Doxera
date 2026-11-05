import { markedText } from './marked'

const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  a: { x: x0, y: y0 },
  b: { x: x1, y: y1 },
})

describe('markedText', () => {
  // 20 characters over 0.1–0.5: 0.02 per character
  const lines = [
    { text: 'Die Frist endet bald', rect: rect(0.1, 0.1, 0.5, 0.12) },
    { text: 'am 30. Juni 2026 um', rect: rect(0.1, 0.13, 0.48, 0.15) },
  ]

  it('takes the words inside each rectangle', () => {
    // "endet bald" (characters 10–19) and "am 30. Juni" on the next line
    expect(markedText(lines, [rect(0.29, 0.095, 0.5, 0.125), rect(0.1, 0.125, 0.32, 0.155)])).toBe(
      'endet bald am 30. Juni',
    )
  })

  it('ignores rectangles that cover no line', () => {
    expect(markedText(lines, [rect(0.1, 0.5, 0.5, 0.6)])).toBe('')
  })
})
