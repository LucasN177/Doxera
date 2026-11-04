import type { TextLine, TextSegment } from './structure'

export interface DetectedTable {
  /** Cell texts, row by row; every row has the same number of columns. */
  rows: string[][]
  /** Indices of the lines (in the input) that make up the table. */
  lines: number[]
}

interface Row {
  lines: number[]
  top: number
  bottom: number
  size: number
  segments: TextSegment[]
}

interface Band {
  left: number
  right: number
}

/** Rows need at least this many lines with two or more cells to count as a table. */
const MIN_ROWS = 3

function segmentsOf(line: TextLine): TextSegment[] {
  return line.segments?.length
    ? line.segments
    : [{ text: line.text, left: line.left, right: line.right }]
}

/** Lines at the same height form one row (PDFs often store table cells column by column). */
function groupRows(lines: readonly TextLine[]): Row[] {
  const order = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.text.trim())
    .sort((a, b) => a.line.top - b.line.top || a.line.left - b.line.left)
  const rows: Row[] = []
  for (const { line, index } of order) {
    const middle = (line.top + line.bottom) / 2
    const row = rows.at(-1)
    if (row && middle >= row.top && middle <= row.bottom) {
      row.lines.push(index)
      row.segments.push(...segmentsOf(line))
      row.bottom = Math.max(row.bottom, line.bottom)
      row.size = Math.max(row.size, line.size)
    } else {
      rows.push({
        lines: [index],
        top: line.top,
        bottom: line.bottom,
        size: line.size,
        segments: [...segmentsOf(line)],
      })
    }
  }
  for (const row of rows) row.segments.sort((a, b) => a.left - b.left)
  return rows
}

function overlap(segment: TextSegment, band: Band): number {
  return Math.min(segment.right, band.right) - Math.max(segment.left, band.left)
}

/** The band a segment belongs to: most overlap, or else the nearest. */
function bandOf(segment: TextSegment, bands: readonly Band[]): number {
  let best = 0
  let score = -Infinity
  for (const [index, band] of bands.entries()) {
    const value = overlap(segment, band)
    if (value > score) {
      score = value
      best = index
    }
  }
  return best
}

/**
 * Columns of a table: the cells of the rows with the most common number of
 * cells, merged where they overlap horizontally.
 */
function columnBands(rows: readonly Row[], tolerance: number): Band[] {
  const counts = new Map<number, number>()
  for (const row of rows)
    counts.set(row.segments.length, (counts.get(row.segments.length) ?? 0) + 1)
  // Most common cell count (ties: the larger one)
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  const intervals = rows
    .filter((row) => row.segments.length === common)
    .flatMap((row) => row.segments.map(({ left, right }) => ({ left, right })))
    .sort((a, b) => a.left - b.left)
  const bands: Band[] = []
  for (const interval of intervals) {
    const band = bands.at(-1)
    if (band && interval.left <= band.right + tolerance) {
      band.right = Math.max(band.right, interval.right)
    } else {
      bands.push({ ...interval })
    }
  }
  return bands
}

/** Turns a run of rows into a table, or null if the columns don't line up. */
function buildTable(rows: readonly Row[]): DetectedTable | null {
  const size = Math.max(...rows.map((row) => row.size))
  const bands = columnBands(
    rows.filter((row) => row.segments.length >= 2),
    size * 0.3,
  )
  if (bands.length < 2) return null

  const cells: string[][] = []
  let aligned = 0
  let multi = 0
  for (const row of rows) {
    const assigned = row.segments.map((segment) => bandOf(segment, bands))
    if (row.segments.length >= 2) {
      multi++
      if (new Set(assigned).size === assigned.length) aligned++
    }
    // A single cell below a row continues the cell above (wrapped text)
    if (row.segments.length === 1 && cells.length > 0) {
      const previous = cells[cells.length - 1]
      const column = assigned[0]
      previous[column] = previous[column]
        ? `${previous[column]} ${row.segments[0].text}`
        : row.segments[0].text
      continue
    }
    const values: string[] = bands.map(() => '')
    for (const [index, segment] of row.segments.entries()) {
      const column = assigned[index]
      values[column] = values[column] ? `${values[column]} ${segment.text}` : segment.text
    }
    cells.push(values)
  }
  // Most rows must put each cell into its own column
  if (aligned < multi * 0.7) return null
  return { rows: cells, lines: rows.flatMap((row) => row.lines) }
}

/**
 * Finds tables in the lines of a page: runs of rows (lines at the same
 * height) with at least two cells each, whose cells line up in columns. A row
 * with a single cell directly below continues a cell (wrapped text).
 */
export function findTables(lines: readonly TextLine[]): DetectedTable[] {
  const rows = groupRows(lines)
  const tables: DetectedTable[] = []
  let run: Row[] = []

  const finish = () => {
    // Trailing single-cell rows belong to the text after the table
    while (run.length > 0 && run[run.length - 1].segments.length < 2) run.pop()
    if (run.filter((row) => row.segments.length >= 2).length >= MIN_ROWS) {
      const table = buildTable(run)
      if (table) tables.push(table)
    }
    run = []
  }

  for (const row of rows) {
    const previous = run.at(-1)
    const gap = previous ? row.top - previous.bottom : 0
    const near = !previous || gap <= Math.max(row.size, previous.size) * 2.5
    if (row.segments.length >= 2) {
      if (!near) finish()
      run.push(row)
    } else if (previous && near && gap <= row.size * 0.8) {
      // Possibly a wrapped cell; decided when the table is built
      run.push(row)
    } else {
      finish()
    }
  }
  finish()
  return tables
}

/** Escapes a table cell for Markdown. */
function markdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

export function tableToMarkdown(rows: readonly string[][]): string {
  if (rows.length === 0) return ''
  const line = (cells: readonly string[]) => `| ${cells.map(markdownCell).join(' | ')} |`
  const [header, ...body] = rows
  return [line(header), line(header.map(() => '---')), ...body.map(line)].join('\n')
}

/**
 * CSV for spreadsheets. Semicolons by default, as German Excel expects them;
 * cells with separators, quotes or line breaks are quoted.
 */
export function tableToCsv(rows: readonly string[][], separator = ';'): string {
  const cell = (text: string) =>
    /["\n\r]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text
  return rows.map((row) => row.map(cell).join(separator)).join('\r\n') + '\r\n'
}

/** Tab-separated rows: pastes straight into spreadsheet cells. */
export function tableToTsv(rows: readonly string[][]): string {
  return rows.map((row) => row.map((text) => text.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
}
