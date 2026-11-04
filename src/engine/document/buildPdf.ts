import type { PDFFont, PDFImage } from 'pdf-lib'
import type { PageRef } from '@/types/document'
import { addNoteAnnotations, drawAnnotations } from './drawAnnotations'

/** What the builder needs from a source: its original bytes. */
export interface SourceData {
  data: Uint8Array
}

export interface BuildOptions {
  /** Document title written to the PDF metadata. */
  title?: string
  /** Image data for image annotations, by asset id. */
  assets?: ReadonlyMap<string, ImageData>
}

export interface ImageData {
  mimeType: 'image/png' | 'image/jpeg'
  data: Uint8Array
}

/**
 * Builds a new PDF from a page list using pdf-lib: pages are copied from their
 * sources in order, with the added rotation, annotations (drawn into the page
 * content) and crop (as CropBox) applied. Page content, annotations
 * and links on the page are kept; document-level parts such as outlines
 * (bookmarks) and form field structure are not carried over.
 */
export async function buildPdf(
  pages: readonly PageRef[],
  sources: ReadonlyMap<string, SourceData>,
  { title, assets = new Map() }: BuildOptions = {},
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('Ein PDF braucht mindestens eine Seite.')

  // Loaded on demand: pdf-lib is only needed when exporting edited documents
  const lib = await import('pdf-lib')
  const { PDFDocument, degrees, StandardFonts } = lib
  const output = await PDFDocument.create()
  let font: PDFFont | null = null
  let boldFont: PDFFont | null = null

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

  // Embed every image once, even if used on several pages
  const images = new Map<string, PDFImage>()
  for (const ref of pages) {
    for (const annotation of ref.annotations ?? []) {
      const assetId =
        annotation.type === 'image' || annotation.type === 'watermark'
          ? annotation.assetId
          : undefined
      if (!assetId || images.has(assetId)) continue
      const asset = assets.get(assetId)
      if (!asset) continue
      images.set(
        assetId,
        asset.mimeType === 'image/png'
          ? await output.embedPng(asset.data)
          : await output.embedJpg(asset.data),
      )
    }
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
    // Annotations and crop both refer to the page's visible box before cropping
    const box = page.getCropBox()
    if (ref.annotations?.length) {
      font ??= await output.embedFont(StandardFonts.Helvetica)
      if (ref.annotations.some((annotation) => annotation.type === 'watermark')) {
        boldFont ??= await output.embedFont(StandardFonts.HelveticaBold)
      }
      drawAnnotations(lib, page, ref.annotations, box, font, images, boldFont ?? font)
      const notes = ref.annotations.filter((annotation) => annotation.type === 'note')
      if (notes.length > 0) addNoteAnnotations(lib, page, notes, box)
    }
    if (ref.crop) {
      const { top, right, bottom, left } = ref.crop
      page.setCropBox(
        box.x + left * box.width,
        box.y + bottom * box.height,
        box.width * (1 - left - right),
        box.height * (1 - top - bottom),
      )
    }
    output.addPage(page)
  }

  if (title) output.setTitle(title)
  output.setProducer('Doxera')
  output.setModificationDate(new Date())
  return output.save()
}
