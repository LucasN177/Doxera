import type { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PageRef } from '@/types/document'

/** A bookmark of a source PDF, pointing to one of its pages. */
export interface OutlineNode {
  title: string
  /** 0-based page in the source; missing for bookmarks without a page target. */
  pageIndex?: number
  /** Shown expanded in viewers. */
  open?: boolean
  children: OutlineNode[]
}

/** The bookmarks of one source, optionally grouped under a title (inserted files). */
export interface SourceOutline {
  sourceId: string
  title?: string
  items: OutlineNode[]
}

/** A bookmark of the built PDF, pointing to one of its pages. */
export interface OutlineEntry {
  title: string
  pageIndex?: number
  open?: boolean
  children: OutlineEntry[]
}

type PdfJsOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>

/** Reads the bookmarks of a PDF with pdf.js; their targets become page indexes. */
export async function readOutline(pdf: PDFDocumentProxy): Promise<OutlineNode[]> {
  const outline = await pdf.getOutline().catch(() => null)
  if (!outline?.length) return []
  const pageOf = async (dest: PdfJsOutline[number]['dest']): Promise<number | undefined> => {
    try {
      const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
      const target = explicit?.[0]
      if (typeof target === 'number') return target
      if (target && typeof target === 'object') return await pdf.getPageIndex(target)
    } catch {
      // Broken target: keep the bookmark without one
    }
    return undefined
  }
  const convert = async (items: PdfJsOutline): Promise<OutlineNode[]> =>
    Promise.all(
      items.map(async (item) => ({
        title: item.title,
        pageIndex: await pageOf(item.dest),
        open: (item.count ?? 0) > 0,
        children: await convert(item.items ?? []),
      })),
    )
  return convert(outline)
}

/**
 * The bookmarks of the sources, retargeted to the built pages: a bookmark
 * points to the first output page made from its source page. Bookmarks of
 * removed pages go; their children move up a level. Sources whose pages
 * aren't used are left out.
 */
export function mapOutline(
  pages: readonly PageRef[],
  outlines: readonly SourceOutline[],
): OutlineEntry[] {
  const result: OutlineEntry[] = []
  for (const { sourceId, title, items } of outlines) {
    const positions = new Map<number, number>()
    pages.forEach((page, index) => {
      if (page.sourceId === sourceId && !positions.has(page.sourceIndex)) {
        positions.set(page.sourceIndex, index)
      }
    })
    if (positions.size === 0) continue
    const convert = (nodes: readonly OutlineNode[]): OutlineEntry[] =>
      nodes.flatMap((node) => {
        const children = convert(node.children)
        const pageIndex = node.pageIndex === undefined ? undefined : positions.get(node.pageIndex)
        // Target page removed: keep the children, drop the bookmark itself
        if (node.pageIndex !== undefined && pageIndex === undefined) return children
        if (pageIndex === undefined && children.length === 0) return []
        return [{ title: node.title, pageIndex, open: node.open, children }]
      })
    const entries = convert(items)
    if (entries.length === 0) continue
    if (title) {
      result.push({ title, pageIndex: Math.min(...positions.values()), children: entries })
    } else result.push(...entries)
  }
  return result
}

/** Writes bookmarks into a PDF built with pdf-lib (replacing any it has). */
export function writeOutline(
  lib: typeof import('pdf-lib'),
  document: PDFDocument,
  entries: readonly OutlineEntry[],
) {
  if (entries.length === 0) return
  const { PDFHexString, PDFName, PDFNull, PDFNumber } = lib
  const { context } = document
  const pages = document.getPages()

  /** Writes a level; returns its first and last ref and the number of visible descendants. */
  const writeLevel = (
    items: readonly OutlineEntry[],
    parent: ReturnType<typeof context.nextRef>,
  ) => {
    const refs = items.map(() => context.nextRef())
    let visible = 0
    items.forEach((item, index) => {
      const dict = context.obj({})
      dict.set(PDFName.of('Title'), PDFHexString.fromText(item.title))
      dict.set(PDFName.of('Parent'), parent)
      if (index > 0) dict.set(PDFName.of('Prev'), refs[index - 1]!)
      if (index < items.length - 1) dict.set(PDFName.of('Next'), refs[index + 1]!)
      const page = item.pageIndex === undefined ? undefined : pages[item.pageIndex]
      if (page) {
        dict.set(
          PDFName.of('Dest'),
          context.obj([page.ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]),
        )
      }
      visible++
      if (item.children.length > 0) {
        const level = writeLevel(item.children, refs[index]!)
        dict.set(PDFName.of('First'), level.first)
        dict.set(PDFName.of('Last'), level.last)
        // Positive: open with that many visible items; negative: closed
        dict.set(PDFName.of('Count'), PDFNumber.of(item.open ? level.visible : -level.visible))
        if (item.open) visible += level.visible
      }
      context.assign(refs[index]!, dict)
    })
    return { first: refs[0]!, last: refs[refs.length - 1]!, visible }
  }

  const root = context.nextRef()
  const level = writeLevel(entries, root)
  context.assign(
    root,
    context.obj({
      Type: 'Outlines',
      First: level.first,
      Last: level.last,
      Count: level.visible,
    }),
  )
  document.catalog.set(PDFName.of('Outlines'), root)
}
