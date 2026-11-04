/** A line of text in reading order, positions in points on the (unrotated) page, y down. */
export interface TextLine {
  text: string
  left: number
  top: number
  right: number
  bottom: number
  /** Font size in points (for recognized text: estimated from the line height). */
  size: number
  bold: boolean
}

export interface ListItem {
  /** The marker as written, e.g. "•", "1." or "a)". */
  marker: string
  text: string
}

export type TextBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }

const LIST_MARKER = /^([•▪◦·●○■□‣⁃*\-–—]|\(?\d{1,3}[.)]|\(?[a-zA-Z]\))\s+(.*)$/

/**
 * The size most text is set in: the median font size weighted by the number
 * of characters, so a few large headings don't count much.
 */
export function bodyFontSize(lines: readonly TextLine[]): number {
  const weighted = lines
    .filter((line) => line.size > 0)
    .map((line) => ({ size: line.size, weight: line.text.length }))
    .sort((a, b) => a.size - b.size)
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let seen = 0
  for (const item of weighted) {
    seen += item.weight
    if (seen >= total / 2) return item.size
  }
  return 12
}

/**
 * Heading level of a line, or 0 for body text.
 *
 * @param standsAlone The line has more space above and below it than lines of
 *   a paragraph. Recognized (scanned) text has no bold information and only
 *   estimated sizes, so a short, slightly larger line standing alone counts too.
 */
function headingLevel(line: TextLine, body: number, standsAlone: boolean): 0 | 1 | 2 | 3 {
  const ratio = line.size / body
  if (ratio >= 1.8) return 1
  if (ratio >= 1.4) return 2
  if (ratio >= 1.25) return 3
  const words = line.text.split(/\s+/).length
  const short = words <= 10 && !/[.,;:!?]$/.test(line.text)
  // Short bold lines, e.g. "Leistungsumfang"
  if (line.bold && ratio >= 0.95 && short) return 3
  if (standsAlone && ratio >= 1.1 && short) return 3
  return 0
}

/** Space between two lines (top of the second minus bottom of the first). */
function gapBetween(first: TextLine | undefined, second: TextLine | undefined): number {
  return first && second ? second.top - first.bottom : Infinity
}

/**
 * Joins two lines of running text. A hyphen at the line end is removed before
 * a lowercase word ("Ver-" + "trag"), kept before a capital ("Baden-" +
 * "Württemberg") and kept with a space before "und"/"oder" ("Nord- und Süd").
 */
export function joinLines(first: string, second: string): string {
  if (/[A-Za-zÀ-ÿ]-$/.test(first)) {
    if (/^(und|oder|bzw\.|sowie|and|or)\b/.test(second)) return `${first} ${second}`
    if (/^[a-zà-ÿß]/.test(second)) return first.slice(0, -1) + second
    if (/^[A-ZÀ-Þ]/.test(second)) return first + second
  }
  return `${first} ${second}`
}

/**
 * Groups the lines of a page into headings, paragraphs and lists: lines close
 * below each other with the same size form a paragraph, larger (or short
 * bold) lines are headings, lines starting with a bullet or number are list
 * items (indented lines below continue them).
 *
 * @param body Size of the body text (see {@link bodyFontSize}), ideally of the
 *   whole document.
 */
export function structureLines(lines: readonly TextLine[], body: number): TextBlock[] {
  const blocks: TextBlock[] = []
  let previous: { line: TextLine; kind: 'heading' | 'paragraph' | 'item'; level: number } | null =
    null

  for (const [index, raw] of lines.entries()) {
    const text = raw.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const line = { ...raw, text }
    const last = blocks.at(-1)
    const gap = previous ? line.top - previous.line.bottom : Infinity
    // Close below the previous line (normal line spacing), same text size
    const close =
      !!previous &&
      gap <= Math.max(previous.line.size, line.size) * 0.9 &&
      gap > -line.size &&
      Math.abs(line.size - previous.line.size) <= Math.max(line.size, previous.line.size) * 0.2

    const spacing = line.size * 0.9
    const standsAlone =
      gapBetween(lines[index - 1], line) > spacing && gapBetween(line, lines[index + 1]) > spacing
    const level = headingLevel(line, body, standsAlone)
    if (level !== 0) {
      if (
        close &&
        previous?.kind === 'heading' &&
        previous.level === level &&
        last?.type === 'heading'
      ) {
        last.text = joinLines(last.text, text)
      } else {
        blocks.push({ type: 'heading', level, text })
      }
      previous = { line, kind: 'heading', level }
      continue
    }

    // "3. Oktober" at the start of a wrapped line is not a list item
    const continues = close && previous?.kind === 'paragraph' && !/[.:!?]$/.test(previous.line.text)
    const marker = continues ? null : LIST_MARKER.exec(text)
    if (marker) {
      const item = { marker: marker[1], text: marker[2] }
      const ordered = /[\da-zA-Z]/.test(marker[1])
      if (last?.type === 'list' && last.ordered === ordered && gap <= line.size * 1.6) {
        last.items.push(item)
      } else {
        blocks.push({ type: 'list', ordered, items: [item] })
      }
      previous = { line, kind: 'item', level: 0 }
      continue
    }

    // Continuation of a list item: indented and close below it
    if (close && previous?.kind === 'item' && last?.type === 'list') {
      const item = last.items[last.items.length - 1]
      if (line.left > previous.line.left + line.size * 0.5) {
        item.text = joinLines(item.text, text)
        previous = { line: { ...line, left: previous.line.left }, kind: 'item', level: 0 }
        continue
      }
    }

    if (close && previous?.kind === 'paragraph' && last?.type === 'paragraph') {
      last.text = joinLines(last.text, text)
    } else {
      blocks.push({ type: 'paragraph', text })
    }
    previous = { line, kind: 'paragraph', level: 0 }
  }
  return blocks
}

/** Escapes characters that would otherwise start Markdown syntax at the beginning of a block. */
function escapeMarkdown(text: string): string {
  return text.replace(/^([#>+]|\d+\.\s|[-*]\s)/, '\\$1')
}

export function toMarkdown(pages: readonly TextBlock[][]): string {
  return pages
    .flat()
    .map((block) => {
      if (block.type === 'heading') return `${'#'.repeat(block.level)} ${block.text}`
      if (block.type === 'paragraph') return escapeMarkdown(block.text)
      return block.items
        .map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${item.text}`)
        .join('\n')
    })
    .join('\n\n')
    .concat('\n')
}

export function toPlainText(pages: readonly TextBlock[][]): string {
  return pages
    .map((blocks) =>
      blocks
        .map((block) =>
          block.type === 'list'
            ? block.items.map((item) => `${item.marker} ${item.text}`).join('\n')
            : block.text,
        )
        .join('\n\n'),
    )
    .filter(Boolean)
    .join('\n\n')
    .concat('\n')
}
