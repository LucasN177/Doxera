import type { PageSize } from '@/types/document'

/** Vertical position and scaled size of every page in the continuous scroll view. */
export interface PageLayout {
  tops: number[]
  widths: number[]
  heights: number[]
  totalHeight: number
  maxWidth: number
}

export function computePageLayout(
  pageSizes: readonly PageSize[],
  scale: number,
  gap: number,
  padding: number,
): PageLayout {
  const tops: number[] = []
  const widths: number[] = []
  const heights: number[] = []
  let y = padding
  let maxWidth = 0

  for (const size of pageSizes) {
    const width = Math.floor(size.width * scale)
    const height = Math.floor(size.height * scale)
    tops.push(y)
    widths.push(width)
    heights.push(height)
    maxWidth = Math.max(maxWidth, width)
    y += height + gap
  }

  const totalHeight = pageSizes.length > 0 ? y - gap + padding : 0
  return { tops, widths, heights, totalHeight, maxWidth }
}

/** Zero-based index of the page that contains (or precedes) the vertical position `y`. */
export function findPageIndexAt(layout: PageLayout, y: number): number {
  const { tops } = layout
  if (tops.length === 0) return -1

  let low = 0
  let high = tops.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (tops[mid] <= y) low = mid
    else high = mid - 1
  }
  return low
}

/** Inclusive, zero-based range of pages that intersect `[top, bottom]`. */
export function getVisibleRange(
  layout: PageLayout,
  top: number,
  bottom: number,
): { first: number; last: number } {
  if (layout.tops.length === 0) return { first: 0, last: -1 }

  let first = findPageIndexAt(layout, top)
  if (layout.tops[first] + layout.heights[first] < top && first < layout.tops.length - 1) {
    first += 1
  }
  const last = Math.max(first, findPageIndexAt(layout, bottom))
  return { first, last }
}
