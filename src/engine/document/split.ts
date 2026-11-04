import type { PageRef } from '@/types/document'

export type SplitMode =
  /** A new file every `size` pages. */
  | { kind: 'every'; size: number }
  /** A new file starts at each of these pages. */
  | { kind: 'before'; ids: ReadonlySet<string> }
  /** One file per page. */
  | { kind: 'single' }

export interface SplitPart {
  pages: PageRef[]
  /** 1-based page numbers in the document. */
  first: number
  last: number
}

/** Splits the page list into consecutive parts. Empty parts are never produced. */
export function splitPages(pages: readonly PageRef[], mode: SplitMode): SplitPart[] {
  const starts = new Set<number>([0])
  pages.forEach((page, index) => {
    if (index === 0) return
    if (mode.kind === 'single') starts.add(index)
    else if (mode.kind === 'every' && index % Math.max(1, Math.floor(mode.size)) === 0)
      starts.add(index)
    else if (mode.kind === 'before' && mode.ids.has(page.id)) starts.add(index)
  })

  const sorted = [...starts].filter((start) => start < pages.length).sort((a, b) => a - b)
  return sorted.map((start, i) => {
    const end = i + 1 < sorted.length ? sorted[i + 1] : pages.length
    return { pages: pages.slice(start, end), first: start + 1, last: end }
  })
}

/** "S. 4" or "S. 1–3" */
export function describePart({ first, last }: Pick<SplitPart, 'first' | 'last'>): string {
  return first === last ? `S. ${first}` : `S. ${first}–${last}`
}

/** File name of a part, e.g. "Vertrag (S. 1–3).pdf". */
export function partFileName(documentName: string, part: Pick<SplitPart, 'first' | 'last'>) {
  return `${documentName.replace(/\.pdf$/i, '')} (${describePart(part)}).pdf`
}
