import type { PageRef } from '@/types/document'

/** What the builder needs from a source: its original bytes. */
export interface SourceData {
  data: Uint8Array
}

export interface BuildOptions {
  /** Document title written to the PDF metadata. */
  title?: string
}

/**
 * Builds a new PDF from a page list using pdf-lib: pages are copied from their
 * sources in order, with the added rotation applied. Page content, annotations
 * and links on the page are kept; document-level parts such as outlines
 * (bookmarks) and form field structure are not carried over.
 */
export async function buildPdf(
  pages: readonly PageRef[],
  sources: ReadonlyMap<string, SourceData>,
  { title }: BuildOptions = {},
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('Ein PDF braucht mindestens eine Seite.')

  // Loaded on demand: pdf-lib is only needed when exporting edited documents
  const { PDFDocument, degrees } = await import('pdf-lib')
  const output = await PDFDocument.create()

  // Load every used source once and copy all its needed pages in one call
  const sourceIds = [...new Set(pages.map((page) => page.sourceId))]
  const copied = new Map<string, Map<number, number>>() // sourceId → sourceIndex → position in copies
  const copies = new Map<string, Awaited<ReturnType<typeof output.copyPages>>>()

  for (const sourceId of sourceIds) {
    const source = sources.get(sourceId)
    if (!source) throw new Error(`Quelle ${sourceId} fehlt.`)
    const document = await PDFDocument.load(source.data, { ignoreEncryption: true })
    const indices = [
      ...new Set(pages.filter((p) => p.sourceId === sourceId).map((p) => p.sourceIndex)),
    ]
    copies.set(sourceId, await output.copyPages(document, indices))
    copied.set(sourceId, new Map(indices.map((sourceIndex, position) => [sourceIndex, position])))
  }

  const used = new Set<object>()
  for (const ref of pages) {
    const position = copied.get(ref.sourceId)!.get(ref.sourceIndex)!
    let page = copies.get(ref.sourceId)![position]
    // A page object can only be added once; duplicates need their own copy
    if (used.has(page)) {
      const source = sources.get(ref.sourceId)!
      const document = await PDFDocument.load(source.data, { ignoreEncryption: true })
      ;[page] = await output.copyPages(document, [ref.sourceIndex])
    }
    used.add(page)
    if (ref.rotation !== 0) {
      page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360))
    }
    output.addPage(page)
  }

  if (title) output.setTitle(title)
  output.setProducer('Doxera')
  output.setModificationDate(new Date())
  return output.save()
}
