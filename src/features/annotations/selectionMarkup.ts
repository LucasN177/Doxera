import { mergeLineRects, toStored, type Box } from '@/engine/document/annotations'
import type { MarkupAnnotation, MarkupType } from '@/types/annotations'
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
