import type { TextRun } from '@/engine/render/pdfjs'

/** Plain text of one page plus the position of every text run within it. */
export interface PageText {
  /** Runs concatenated; a line break after a run is represented by `\n`. */
  raw: string
  runStarts: number[]
  runLengths: number[]
}

/** Part of a match that lies within a single text run. Offsets are relative to the run. */
export interface RunRange {
  run: number
  start: number
  end: number
}

export interface SearchMatch {
  /** Zero-based page index. */
  pageIndex: number
  /** A match can span several runs (e.g. across a line break). */
  ranges: RunRange[]
}

export interface SearchOptions {
  matchCase: boolean
}

/** Upper bound to keep the UI responsive for very common queries. */
export const MAX_MATCHES = 5000

export function buildPageText(runs: readonly TextRun[]): PageText {
  let raw = ''
  const runStarts: number[] = []
  const runLengths: number[] = []
  for (const run of runs) {
    runStarts.push(raw.length)
    runLengths.push(run.str.length)
    raw += run.str
    if (run.hasEOL) raw += '\n'
  }
  return { raw, runStarts, runLengths }
}

/**
 * Normalizes text for matching: whitespace runs collapse to a single space and,
 * unless `matchCase`, letters are lower-cased. `map[i]` is the raw offset of
 * normalized character `i`.
 */
export function normalize(raw: string, matchCase: boolean): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let previousWasSpace = true

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (/\s/.test(char)) {
      if (!previousWasSpace) {
        text += ' '
        map.push(i)
        previousWasSpace = true
      }
      continue
    }
    previousWasSpace = false
    const normalized = matchCase ? char : char.toLocaleLowerCase()
    for (const part of normalized) {
      text += part
      map.push(i)
    }
  }
  return { text, map }
}

/** Splits the raw range `[start, end)` into per-run ranges. */
export function toRunRanges(page: PageText, start: number, end: number): RunRange[] {
  const ranges: RunRange[] = []
  for (let run = 0; run < page.runStarts.length; run++) {
    const runStart = page.runStarts[run]
    const runEnd = runStart + page.runLengths[run]
    if (runEnd <= start) continue
    if (runStart >= end) break
    const from = Math.max(start, runStart) - runStart
    const to = Math.min(end, runEnd) - runStart
    if (to > from) ranges.push({ run, start: from, end: to })
  }
  return ranges
}

/** Finds all non-overlapping occurrences of `query` in the given pages, in document order. */
export function searchPages(
  pages: readonly PageText[],
  query: string,
  { matchCase }: SearchOptions,
): SearchMatch[] {
  const needle = normalize(query, matchCase).text.trim()
  if (!needle) return []

  const matches: SearchMatch[] = []
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]
    const { text, map } = normalize(page.raw, matchCase)

    let from = 0
    while (matches.length < MAX_MATCHES) {
      const found = text.indexOf(needle, from)
      if (found === -1) break
      const rawStart = map[found]
      const rawEnd = map[found + needle.length - 1] + 1
      const ranges = toRunRanges(page, rawStart, rawEnd)
      if (ranges.length > 0) matches.push({ pageIndex, ranges })
      from = found + needle.length
    }
    if (matches.length >= MAX_MATCHES) break
  }
  return matches
}
