import type { PDFFont, PDFImage } from 'pdf-lib'
import type { PageRef } from '@/types/document'
import type { FormValues } from '@/types/forms'
import { standardFontName } from './annotations'
import { writeOutline, type OutlineEntry } from './outline'
import { hasImageReplacements, hasTextReplacements, textRemovalPages } from './contentEditing'
import {
  addNoteAnnotations,
  addRedactAnnotations,
  drawAnnotations,
  hideImageXObjects,
  textFontKey,
} from './drawAnnotations'
import {
  embedUnicodeFont,
  needsUnicode,
  unicodeFontKey,
  unicodeStyle,
} from '@/engine/fonts/unicodeFont'

/** What the builder needs from a source: its original bytes. */
export interface SourceData {
  data: Uint8Array
}

export interface BuildOptions {
  /** Document title written to the PDF metadata. */
  title?: string
  /** Image data for image annotations, by asset id. */
  assets?: ReadonlyMap<string, ImageData>
  /**
   * Applies the redaction annotations of the built PDF for good. Defaults to
   * MuPDF in a worker; tests pass MuPDF directly.
   */
  redact?: (data: Uint8Array, mode: 'redact' | 'text' | 'clean') => Promise<Uint8Array>
  /** Form values for the fields of one source; they are drawn into its pages (flattened). */
  forms?: { sourceId: string; values: FormValues }
  /** Bookmarks of the built PDF (see `mapOutline`). */
  outline?: readonly OutlineEntry[]
}

/** Source id of the intermediate file with replaced text removed. */
const TEXT_REMOVED_SOURCE = 'doxera:text-removed'

export interface ImageData {
  mimeType: 'image/png' | 'image/jpeg'
  data: Uint8Array
}

/**
 * Builds a new PDF from a page list using pdf-lib: pages are copied from their
 * sources in order, with the added rotation, annotations (drawn into the page
 * content) and crop (as CropBox) applied. Redactions are applied afterwards
 * with MuPDF, which removes the content below them. Page content, annotations
 * and links on the page are kept; bookmarks are written from `outline`, form
 * field structure is not carried over.
 */
export async function buildPdf(
  pages: readonly PageRef[],
  sources: ReadonlyMap<string, SourceData>,
  { title, assets = new Map(), redact = defaultRedact, forms, outline }: BuildOptions = {},
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('Ein PDF braucht mindestens eine Seite.')

  // Edited text: first remove the original lines (MuPDF), then build from that
  // intermediate file, where the new text is drawn like any text annotation
  if (hasTextReplacements(pages)) {
    const removed = await buildPdf(textRemovalPages(pages), sources, {
      redact: (data) => redact(data, 'text'),
      // Form values are drawn in here: later stages read the intermediate file
      forms,
    })
    return buildPdf(
      pages.map((page, index) => ({
        ...page,
        sourceId: TEXT_REMOVED_SOURCE,
        sourceIndex: index,
        annotations: page.annotations?.map((item) =>
          item.type === 'text' && item.replaces
            ? { ...item, replaces: undefined }
            : // Originals are already hidden in the intermediate file
              item.type === 'image' && item.xobject
              ? { ...item, xobject: undefined }
              : item,
        ),
      })),
      new Map(sources).set(TEXT_REMOVED_SOURCE, { data: removed }),
      { title, assets, redact, outline },
    )
  }

  // Loaded on demand: pdf-lib is only needed when exporting edited documents
  const lib = await import('pdf-lib')
  const { PDFDocument, degrees, StandardFonts } = lib
  const output = await PDFDocument.create()
  let font: PDFFont | null = null
  let boldFont: PDFFont | null = null
  const textFonts = new Map<string, PDFFont>()

  /** Loads a source; the one with form values gets them filled in and flattened first. */
  const loadSource = async (sourceId: string, data: Uint8Array) => {
    const document = await PDFDocument.load(data, { ignoreEncryption: true })
    if (forms && forms.sourceId === sourceId && Object.keys(forms.values).length > 0) {
      const { fillForm } = await import('@/engine/forms/fill')
      await fillForm(lib, document, forms.values, true)
    }
    return document
  }

  // Load every used source once and copy all its needed pages in one call
  const sourceIds = [...new Set(pages.map((page) => page.sourceId))]
  const copied = new Map<string, Map<number, number>>() // sourceId → sourceIndex → position in copies
  const copies = new Map<string, Awaited<ReturnType<typeof output.copyPages>>>()

  for (const sourceId of sourceIds) {
    const source = sources.get(sourceId)
    if (!source) throw new Error(`Quelle ${sourceId} fehlt.`)
    const document = await loadSource(sourceId, source.data)
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
      const document = await loadSource(ref.sourceId, source.data)
      ;[page] = await output.copyPages(document, [ref.sourceIndex])
    }
    used.add(page)
    if (ref.rotation !== 0) {
      page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360))
    }
    // Annotations and crop both refer to the page's visible box before cropping
    const box = page.getCropBox()
    if (ref.annotations?.length) {
      // Original images that were moved, resized or removed
      hideImageXObjects(
        lib,
        page,
        ref.annotations.flatMap((item) =>
          item.type === 'image' && item.xobject ? [item.xobject] : [],
        ),
      )
      font ??= await output.embedFont(StandardFonts.Helvetica)
      if (ref.annotations.some((annotation) => annotation.type === 'watermark')) {
        boldFont ??= await output.embedFont(StandardFonts.HelveticaBold)
      }
      for (const annotation of ref.annotations) {
        if (annotation.type === 'watermark' && !annotation.assetId) {
          const key = unicodeFontKey('Bold')
          if (needsUnicode(annotation.text) && !textFonts.has(key)) {
            textFonts.set(key, await embedUnicodeFont(output, 'Bold'))
          }
        }
        if (annotation.type !== 'text') continue
        const key = textFontKey(annotation)
        if (textFonts.has(key)) continue
        textFonts.set(
          key,
          needsUnicode(annotation.text)
            ? await embedUnicodeFont(output, unicodeStyle(annotation.bold, annotation.italic))
            : await output.embedFont(standardFontName(annotation)),
        )
      }
      drawAnnotations(lib, page, ref.annotations, box, font, images, boldFont ?? font, textFonts)
      const notes = ref.annotations.filter((annotation) => annotation.type === 'note')
      if (notes.length > 0) addNoteAnnotations(lib, page, notes, box)
      const redactions = ref.annotations.filter((annotation) => annotation.type === 'redact')
      if (redactions.length > 0) addRedactAnnotations(page, redactions, box)
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

  if (outline) writeOutline(lib, output, outline)
  if (title) output.setTitle(title)
  output.setProducer('Doxera')
  output.setModificationDate(new Date())
  const data = await output.save()
  const redacting = pages.some((page) => page.annotations?.some((item) => item.type === 'redact'))
  if (redacting) return redact(data, 'redact')
  // Replaced images are no longer drawn; rewriting drops their data from the file
  return hasImageReplacements(pages) ? redact(data, 'clean') : data
}

async function defaultRedact(
  data: Uint8Array,
  mode: 'redact' | 'text' | 'clean',
): Promise<Uint8Array> {
  const { redactPdf } = await import('@/engine/mupdf/client')
  return redactPdf(data, mode)
}
