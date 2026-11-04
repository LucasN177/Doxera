import type { PageSize } from '@/types/document'

export type ZoomMode = 'fit-width' | 'fit-page' | 'custom'

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 5

/** Preset zoom levels used by zoom in/out and the zoom menu. */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5] as const

export function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
}

/** Next preset zoom level above (`1`) or below (`-1`) the given scale. */
export function stepZoom(scale: number, direction: 1 | -1): number {
  const epsilon = 0.001
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > scale + epsilon) ?? MAX_ZOOM
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < scale - epsilon) ?? MIN_ZOOM
}

export interface Viewport {
  width: number
  height: number
}

/**
 * Scale at which the widest page fits the viewport width (`fit-width`) or the
 * first page fits completely (`fit-page`). `padding` is the free space kept
 * around pages on each side.
 */
export function computeFitScale(
  mode: Exclude<ZoomMode, 'custom'>,
  pageSizes: readonly PageSize[],
  viewport: Viewport,
  padding: number,
): number {
  if (pageSizes.length === 0 || viewport.width <= 0 || viewport.height <= 0) return 1

  const availableWidth = Math.max(1, viewport.width - 2 * padding)
  const availableHeight = Math.max(1, viewport.height - 2 * padding)

  if (mode === 'fit-width') {
    const maxWidth = Math.max(...pageSizes.map((size) => size.width))
    return clampZoom(availableWidth / maxWidth)
  }

  const first = pageSizes[0]
  return clampZoom(Math.min(availableWidth / first.width, availableHeight / first.height))
}

export function formatZoom(scale: number): string {
  return `${Math.round(scale * 100)} %`
}
