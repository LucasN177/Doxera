import { findPageIndexAt, type PageLayout } from './pageLayout'
import { clampZoom } from './zoom'

/** A point that should stay under the user's fingers (or cursor) while zooming. */
export interface FocalPoint {
  /** Position in the previous layout's content coordinates. */
  contentX: number
  contentY: number
  /** Where the point should end up, relative to the scroll container's visible area. */
  viewportX: number
  viewportY: number
}

/** Width of the scrollable content: pages plus padding, at least the container width. */
export function contentWidth(layout: PageLayout, padding: number, clientWidth: number): number {
  return Math.max(layout.maxWidth + 2 * padding, clientWidth)
}

/**
 * Scroll position after a zoom change that keeps `focal` in place. Vertically the
 * point is tracked relative to its page (gaps and padding don't scale), horizontally
 * relative to the centered page column.
 */
export function scrollForFocalPoint(
  previous: PageLayout,
  next: PageLayout,
  scaleRatio: number,
  focal: FocalPoint,
  clientWidth: number,
  padding: number,
): { scrollTop: number; scrollLeft: number } {
  const index = Math.max(0, findPageIndexAt(previous, focal.contentY))
  const fraction =
    (focal.contentY - (previous.tops[index] ?? 0)) / Math.max(1, previous.heights[index] ?? 1)
  const nextY = (next.tops[index] ?? 0) + fraction * (next.heights[index] ?? 0)

  const previousWidth = contentWidth(previous, padding, clientWidth)
  const nextWidth = contentWidth(next, padding, clientWidth)
  const nextX = (focal.contentX - previousWidth / 2) * scaleRatio + nextWidth / 2

  return {
    scrollTop: Math.max(0, nextY - focal.viewportY),
    scrollLeft: Math.max(0, nextX - focal.viewportX),
  }
}

/** Visual scale factor for a pinch, limited so the resulting zoom stays in the allowed range. */
export function limitPinchRatio(startScale: number, rawRatio: number): number {
  if (!Number.isFinite(rawRatio) || rawRatio <= 0) return 1
  return clampZoom(startScale * rawRatio) / startScale
}
