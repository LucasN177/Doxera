import type { PageRect } from '@/types/annotations'

interface LineLike {
  text: string
  rect: PageRect
}

const bounds = (rect: PageRect) => ({
  x0: Math.min(rect.a.x, rect.b.x),
  x1: Math.max(rect.a.x, rect.b.x),
  y0: Math.min(rect.a.y, rect.b.y),
  y1: Math.max(rect.a.y, rect.b.y),
})

/**
 * The text below markup rectangles (highlights, underlines, strike-outs):
 * per rectangle the words of the lines it covers whose middle lies inside
 * it. Word positions are estimated along the line, which is reliable at word
 * level since selections end at word boundaries.
 */
export function markedText(lines: readonly LineLike[], rects: readonly PageRect[]): string {
  const parts: string[] = []
  for (const rect of rects) {
    const area = bounds(rect)
    for (const line of lines) {
      const box = bounds(line.rect)
      // The rectangle covers the line's vertical middle
      const middle = (box.y0 + box.y1) / 2
      if (middle < area.y0 || middle > area.y1) continue
      const width = box.x1 - box.x0
      const length = line.text.length
      if (length === 0 || width <= 0) continue
      for (const match of line.text.matchAll(/\S+/g)) {
        const center = box.x0 + ((match.index + match[0].length / 2) / length) * width
        if (center >= area.x0 && center <= area.x1) parts.push(match[0])
      }
    }
  }
  return parts.join(' ')
}
