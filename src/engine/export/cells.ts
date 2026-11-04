/** A spreadsheet cell: text, or a number with a display format. */
export type Cell = string | { value: number; format: NumberFormat }

export type NumberFormat = 'integer' | 'decimal' | 'euro' | 'percent'

/**
 * Turns a cell text into a number where it is clearly one, so spreadsheets
 * can calculate with it: German ("1.234,50") and English ("1,234.50")
 * notation, optionally with € or %. Everything else (dates, units, codes
 * with leading zeros, mixed text) stays text.
 */
export function toCell(text: string): Cell {
  const trimmed = text.trim()
  const match = /^([-+]?)(?:€\s*)?([\d.,\s]*\d)\s*(€|EUR|%)?$/i.exec(trimmed)
  if (!match) return text
  const [, sign, digits, suffix] = match
  const compact = digits.replace(/\s/g, '')
  // Leading zeros are codes (postal codes, IDs), not numbers
  if (/^0\d/.test(compact)) return text

  let normalized: string
  let decimals = 0
  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // Both: the later one is the decimal separator
    const decimal = lastComma > lastDot ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    if (!validGroups(compact.slice(0, compact.lastIndexOf(decimal)), thousands)) return text
    normalized = compact.split(thousands).join('').replace(decimal, '.')
    decimals = compact.length - compact.lastIndexOf(decimal) - 1
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.'
    const parts = compact.split(separator)
    // "1.234" or "1,234,567": thousands groups; "2,5" or "3.75": decimals
    const grouped = parts.length > 2 || (parts[1].length === 3 && separator === '.')
    if (grouped) {
      if (!validGroups(compact, separator)) return text
      normalized = parts.join('')
    } else {
      if (parts.length !== 2) return text
      normalized = `${parts[0]}.${parts[1]}`
      decimals = parts[1].length
    }
  } else {
    normalized = compact
  }

  const value = Number(`${sign}${normalized}`)
  if (!Number.isFinite(value)) return text
  const unit = suffix?.toLowerCase()
  if (unit === '%') return { value: value / 100, format: 'percent' }
  if (unit === '€' || unit === 'eur' || trimmed.includes('€')) return { value, format: 'euro' }
  return { value, format: decimals > 0 ? 'decimal' : 'integer' }
}

/** "1.234.567" style grouping: first group 1–3 digits, then groups of exactly 3. */
function validGroups(text: string, separator: string): boolean {
  const groups = text.split(separator)
  return (
    (/^\d{1,3}$/.test(groups[0]) || (groups.length === 1 && /^\d+$/.test(groups[0]))) &&
    groups.slice(1).every((group) => /^\d{3}$/.test(group))
  )
}

/** The cell as plain text (for CSV and JSON). */
export function cellText(cell: Cell): string {
  return typeof cell === 'string' ? cell : String(cell.value)
}
