import { formatRelativeTime } from './time'

const now = new Date('2026-11-04T12:00:00Z').getTime()
const minutes = (n: number) => now - n * 60 * 1000

describe('formatRelativeTime', () => {
  it('formats recent times', () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe('gerade eben')
    expect(formatRelativeTime(minutes(5), now)).toBe('vor 5 Minuten')
    expect(formatRelativeTime(minutes(60 * 3), now)).toBe('vor 3 Stunden')
  })

  it('uses natural words for yesterday', () => {
    expect(formatRelativeTime(minutes(60 * 24), now)).toBe('gestern')
  })

  it('formats older times', () => {
    expect(formatRelativeTime(minutes(60 * 24 * 14), now)).toBe('vor 2 Wochen')
  })
})
