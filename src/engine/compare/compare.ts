import { diff } from './diff'

/** A line of text and the page (0-based) it is on. */
export interface TextLineRef {
  text: string
  page: number
}

export interface DiffPart {
  type: 'equal' | 'removed' | 'added'
  text: string
}

/** One place where the texts differ. */
export interface TextChange {
  /** Page in the old document (0-based) the change is at. */
  oldPage: number
  /** Page in the new document (0-based) the change is at. */
  newPage: number
  /** The changed text with removed and added words marked. */
  parts: DiffPart[]
  /** Unchanged text just before and after, for orientation. */
  before: string
  after: string
}

export interface CompareResult {
  changes: TextChange[]
  removedWords: number
  addedWords: number
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
const words = (text: string) => text.split(' ').filter(Boolean)

/** Up to `count` words from the start or end of a text. */
function excerpt(text: string | undefined, count: number, fromEnd: boolean): string {
  if (!text) return ''
  const list = words(text)
  if (list.length <= count) return list.join(' ')
  return fromEnd ? `… ${list.slice(-count).join(' ')}` : `${list.slice(0, count).join(' ')} …`
}

/** Joins neighbouring parts of the same type. */
function merge(parts: DiffPart[]): DiffPart[] {
  const result: DiffPart[] = []
  for (const part of parts) {
    const last = result[result.length - 1]
    if (last?.type === part.type) last.text += ` ${part.text}`
    else result.push({ ...part })
  }
  return result
}

/**
 * Compares the text of two documents: first line by line, then word by word
 * within changed lines. Differences in line breaks and spacing are ignored.
 */
export function compareTexts(
  oldLines: readonly TextLineRef[],
  newLines: readonly TextLineRef[],
): CompareResult {
  const a = oldLines.map((line) => ({ ...line, text: normalize(line.text) })).filter((l) => l.text)
  const b = newLines.map((line) => ({ ...line, text: normalize(line.text) })).filter((l) => l.text)
  const ops = diff(
    a.map((line) => line.text),
    b.map((line) => line.text),
  )

  const changes: TextChange[] = []
  let removedWords = 0
  let addedWords = 0
  let index = 0
  // Last unchanged line on each side (for pages of pure insertions or removals)
  let lastA = -1
  let lastB = -1
  while (index < ops.length) {
    const op = ops[index]!
    if (op.type === 'equal') {
      lastA = op.a
      lastB = op.b
      index++
      continue
    }
    const removed: number[] = []
    const added: number[] = []
    while (index < ops.length && ops[index]!.type !== 'equal') {
      const current = ops[index]!
      if (current.type === 'removed') removed.push(current.a)
      else if (current.type === 'added') added.push(current.b)
      index++
    }
    const next = ops[index]
    const nextA = next?.type === 'equal' ? next.a : a.length
    const nextB = next?.type === 'equal' ? next.b : b.length

    // Word diff of the changed block; reflowed lines turn out equal here
    const oldWords = words(removed.map((i) => a[i]!.text).join(' '))
    const newWords = words(added.map((i) => b[i]!.text).join(' '))
    const parts: DiffPart[] = diff(oldWords, newWords).map((item) =>
      item.type === 'added'
        ? { type: 'added', text: newWords[item.b]! }
        : { type: item.type, text: oldWords[item.a]! },
    )
    const removedCount = parts.filter((part) => part.type === 'removed').length
    const addedCount = parts.filter((part) => part.type === 'added').length
    if (removedCount + addedCount === 0) continue
    removedWords += removedCount
    addedWords += addedCount

    const pageOf = (lines: typeof a, changed: number[], last: number, following: number) =>
      changed.length > 0
        ? lines[changed[0]!]!.page
        : (lines[following]?.page ?? lines[last]?.page ?? 0)
    changes.push({
      oldPage: pageOf(a, removed, lastA, nextA),
      newPage: pageOf(b, added, lastB, nextB),
      parts: shorten(merge(parts)),
      before: excerpt(a[lastA]?.text, 8, true),
      after: excerpt(a[nextA]?.text, 8, false),
    })
  }
  return { changes, removedWords, addedWords }
}

/** Long unchanged stretches inside a change are cut to their ends. */
function shorten(parts: DiffPart[]): DiffPart[] {
  return parts.map((part, index) => {
    if (part.type !== 'equal') return part
    const list = words(part.text)
    if (list.length <= 16) return part
    const first = index === 0
    const last = index === parts.length - 1
    const head = first ? [] : list.slice(0, 6)
    const tail = last ? [] : list.slice(-6)
    return { type: 'equal', text: [...head, '…', ...tail].join(' ') }
  })
}
