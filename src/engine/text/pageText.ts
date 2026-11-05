import { replacedLines, sameRect, type EditableLine } from '@/engine/document/contentEditing'
import { textLines } from '@/engine/document/annotations'
import type { PageRect, TextAnnotation } from '@/types/annotations'
import type { PageRef } from '@/types/document'
import type { TextLine } from './structure'

function overlaps(a: PageRect, b: PageRect): boolean {
  const ax0 = Math.min(a.a.x, a.b.x)
  const ax1 = Math.max(a.a.x, a.b.x)
  const ay0 = Math.min(a.a.y, a.b.y)
  const ay1 = Math.max(a.a.y, a.b.y)
  const bx0 = Math.min(b.a.x, b.b.x)
  const bx1 = Math.max(b.a.x, b.b.x)
  const by0 = Math.min(b.a.y, b.b.y)
  const by1 = Math.max(b.a.y, b.b.y)
  return ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1
}

/** Lines of a text annotation (box text, or the edited version of a PDF line). */
function annotationLines(text: TextAnnotation, size: { width: number; height: number }) {
  const left = text.at.x * size.width
  return textLines(text.text).map((line, index) => {
    const top = text.at.y * size.height + index * text.fontSize * 1.2
    return {
      text: line,
      left,
      top,
      right: left + line.length * text.fontSize * 0.5,
      bottom: top + text.fontSize,
      size: text.fontSize,
      bold: !!text.bold,
    }
  })
}

/**
 * The text of a page as it looks in Doxera: the PDF's own lines, minus those
 * that were edited (their new version takes their place), outside the crop or
 * touched by a redaction (left out entirely, so nothing redacted leaks), plus
 * text boxes in reading position.
 *
 * @param lines Editable lines of the page's source page (stored fractions).
 * @param size Size of the unrotated page in points.
 */
export function pageTextLines(
  lines: readonly EditableLine[],
  ref: PageRef,
  size: { width: number; height: number },
): TextLine[] {
  const annotations = ref.annotations ?? []
  const redactions = annotations.flatMap((item) => (item.type === 'redact' ? [item] : []))
  const texts = annotations.flatMap((item) => (item.type === 'text' ? [item] : []))
  const crop = ref.crop ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const visible = (rect: PageRect) => {
    const x = (rect.a.x + rect.b.x) / 2
    const y = (rect.a.y + rect.b.y) / 2
    return x >= crop.left && x <= 1 - crop.right && y >= crop.top && y <= 1 - crop.bottom
  }

  const result: TextLine[] = []
  for (const line of lines) {
    if (!visible(line.rect)) continue
    if (redactions.some((redaction) => overlaps(redaction, line.rect))) continue
    // An edited line: its new text, if any, is added with the text boxes below
    if (texts.some((text) => replacedLines(text).some((rect) => sameRect(rect, line.rect)))) {
      continue
    }
    result.push({
      text: line.text,
      left: line.rect.a.x * size.width,
      top: line.rect.a.y * size.height,
      right: line.rect.b.x * size.width,
      bottom: line.rect.b.y * size.height,
      size: line.fontSize,
      bold: line.bold,
      segments: line.segments?.map((segment) => ({
        text: segment.text,
        left: segment.x0 * size.width,
        right: segment.x1 * size.width,
      })),
    })
  }

  // Text boxes go after the last line that starts above them (keeps the order
  // of columns as the PDF has it)
  for (const text of texts) {
    if (!text.text.trim()) continue
    const anchor = text.replaces ?? { a: text.at, b: text.at }
    if (!visible(anchor)) continue
    if (redactions.some((redaction) => overlaps(redaction, anchor))) continue
    const added = annotationLines(text, size)
    const top = added[0].top
    let index = result.length
    while (index > 0 && result[index - 1].top > top + 0.5) index--
    result.splice(index, 0, ...added)
  }
  return result
}
