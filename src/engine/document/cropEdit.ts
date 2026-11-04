import type { CropInsets } from '@/types/document'
import { MIN_CROP_SIZE } from './pageOps'

/** Drag handle of the crop frame: edges, corners, or the whole frame. */
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * New crop after dragging `handle` by (dx, dy), both as fractions of the page
 * size. Edges stop at the page border and keep a minimum visible size; moving
 * shifts the frame without resizing it.
 */
export function adjustCrop(
  start: CropInsets,
  handle: CropHandle,
  dx: number,
  dy: number,
): CropInsets {
  const { top, right, bottom, left } = start
  if (handle === 'move') {
    const shiftX = clamp(dx, -left, right)
    const shiftY = clamp(dy, -top, bottom)
    return {
      top: top + shiftY,
      bottom: bottom - shiftY,
      left: left + shiftX,
      right: right - shiftX,
    }
  }
  const next = { ...start }
  if (handle.includes('n')) next.top = clamp(top + dy, 0, 1 - bottom - MIN_CROP_SIZE)
  if (handle.includes('s')) next.bottom = clamp(bottom - dy, 0, 1 - top - MIN_CROP_SIZE)
  if (handle.includes('w')) next.left = clamp(left + dx, 0, 1 - right - MIN_CROP_SIZE)
  if (handle.includes('e')) next.right = clamp(right - dx, 0, 1 - left - MIN_CROP_SIZE)
  return next
}
