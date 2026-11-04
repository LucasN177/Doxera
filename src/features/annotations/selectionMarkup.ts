import {
  mergeLineRects,
  REDACT_COLOR,
  toDisplay,
  toStored,
  type Box,
} from '@/engine/document/annotations'
import type { MarkupAnnotation, MarkupType, RedactAnnotation } from '@/types/annotations'
import type { ResolvedPage } from '@/types/document'

/** Text nodes of the PDF text layers that the range covers. */
function selectedTextNodes(range: Range): Text[] {
  const root = range.commonAncestorContainer
  if (root.nodeType === Node.TEXT_NODE) return [root as Text]
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (range.intersectsNode(node)) nodes.push(node as Text)
  }
  return nodes
}

/** True if the selection lies (at least partly) in a page's text layer. */
export function isPdfTextSelection(selection: Selection | null): selection is Selection {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false
  const inLayer = (node: Node | null) =>
    !!(node instanceof Element ? node : node?.parentElement)?.closest('.textLayer')
  return inLayer(selection.anchorNode) || inLayer(selection.focusNode)
}

/**
 * Turns the current text selection into one markup annotation per page, with
 * one rectangle per selected line.
 */
export function markupsFromSelection(
  selection: Selection,
  pages: readonly ResolvedPage[],
  type: MarkupType,
  color: string,
): Array<{ pageId: string; annotation: MarkupAnnotation }> {
  if (!isPdfTextSelection(selection)) return []
  const range = selection.getRangeAt(0)

  // Collect the client rectangles of every selected text piece, grouped by page
  const byPage = new Map<HTMLElement, DOMRect[]>()
  for (const node of selectedTextNodes(range)) {
    const pageElement = node.parentElement?.closest<HTMLElement>('[data-page-number]')
    if (!pageElement || !node.parentElement?.closest('.textLayer')) continue
    const piece = document.createRange()
    piece.selectNodeContents(node)
    if (node === range.startContainer) piece.setStart(node, range.startOffset)
    if (node === range.endContainer) piece.setEnd(node, range.endOffset)
    const rects = byPage.get(pageElement) ?? []
    rects.push(...Array.from(piece.getClientRects()))
    byPage.set(pageElement, rects)
  }

  const result: Array<{ pageId: string; annotation: MarkupAnnotation }> = []
  for (const [pageElement, rects] of byPage) {
    const page = pages[Number(pageElement.dataset.pageNumber) - 1]
    // Coordinates refer to the full (uncropped) page surface
    const surface = pageElement.querySelector<HTMLElement>('.pdf-page')
    if (!page || !surface) continue
    const origin = surface.getBoundingClientRect()
    const boxes: Box[] = rects.map((rect) => ({
      x0: rect.left - origin.left,
      y0: rect.top - origin.top,
      x1: rect.right - origin.left,
      y1: rect.bottom - origin.top,
    }))
    const lines = mergeLineRects(boxes)
    if (lines.length === 0) continue

    const fraction = (x: number, y: number) =>
      toStored({ x: x / origin.width, y: y / origin.height }, page.turns)
    result.push({
      pageId: page.ref.id,
      annotation: {
        id: crypto.randomUUID(),
        type,
        color,
        turns: page.turns,
        rects: lines.map((line) => ({
          a: fraction(line.x0, line.y0),
          b: fraction(line.x1, line.y1),
        })),
      },
    })
  }
  return result
}

/**
 * Turns the current text selection into redaction areas, one per selected
 * line, slightly enlarged so that the glyphs are fully covered.
 */
export function redactionsFromSelection(
  selection: Selection,
  pages: readonly ResolvedPage[],
): Array<{ pageId: string; annotation: RedactAnnotation }> {
  return markupsFromSelection(selection, pages, 'highlight', REDACT_COLOR).flatMap(
    ({ pageId, annotation }) =>
      annotation.rects.map((rect) => {
        const { turns } = annotation
        const a = toDisplay(rect.a, turns)
        const b = toDisplay(rect.b, turns)
        // Lines run along the display x axis: pad mostly across them
        const pad = Math.abs(a.y - b.y) * 0.12
        const x0 = Math.min(a.x, b.x) - pad / 2
        const x1 = Math.max(a.x, b.x) + pad / 2
        const y0 = Math.min(a.y, b.y) - pad
        const y1 = Math.max(a.y, b.y) + pad
        return {
          pageId,
          annotation: {
            id: crypto.randomUUID(),
            type: 'redact' as const,
            color: REDACT_COLOR,
            a: toStored({ x: x0, y: y0 }, turns),
            b: toStored({ x: x1, y: y1 }, turns),
          },
        }
      }),
  )
}
