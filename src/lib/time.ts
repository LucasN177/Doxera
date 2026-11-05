import { locale } from '@/i18n'
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

/** "gerade eben", "vor 5 Minuten", "gestern", … */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const elapsed = now - timestamp
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return formatter.format(-Math.floor(elapsed / ms), unit)
  }
  return 'gerade eben'
}
