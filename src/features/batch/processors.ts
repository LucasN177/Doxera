import { unrotatedSize } from '@/engine/document/annotations'
import { toEditableLines } from '@/engine/document/contentEditing'
import type { DocumentData } from '@/engine/export/dataExport'
import type { DataFormat } from '@/engine/export/dataFiles'
import type { CompressionLevel } from '@/engine/mupdf/compress'
import type { OcrLanguage } from '@/engine/ocr/tesseract'
import { closePdf, getPageSizes, openPdf } from '@/engine/render/pdfjs'
import { pageTextLines } from '@/engine/text/pageText'
import { bodyFontSize, structureLines } from '@/engine/text/structure'
import type { ImageFormat } from '@/features/convert/renderImages'
import { formatFileSize, hasPdfSignature, looksLikePdf } from '@/lib/file'
import { looksLikeImage, prepareImage } from '@/lib/images'
import type { OcrPage } from '@/types/ocr'

export type BatchAction =
  | { type: 'compress'; level: CompressionLevel }
  | { type: 'ocr'; languages: OcrLanguage[]; skipPagesWithText: boolean }
  | { type: 'images'; format: ImageFormat; dpi: number }
  | { type: 'data'; format: DataFormat }
  | { type: 'merge' }

export interface BatchResult {
  files: File[]
  /** Short summary for the list, e.g. "4,2 MB → 1,1 MB". */
  note: string
}

export interface BatchContext {
  signal: AbortSignal
  /** Progress of the current file, 0–1. */
  onProgress: (progress: number) => void
}

const EMPTY_OCR: OcrPage = { blocks: [], confidence: 0 }

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '') || 'Dokument'
}

function aborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError')
}

/** The file as PDF bytes; pictures become a one-page PDF (A4). */
export async function toPdfBytes(file: File): Promise<Uint8Array> {
  if (looksLikePdf(file)) {
    const data = new Uint8Array(await file.arrayBuffer())
    if (!hasPdfSignature(data)) throw new Error(`„${file.name}“ ist keine gültige PDF-Datei.`)
    return data
  }
  if (looksLikeImage(file)) {
    const { imagesToPdf } = await import('@/engine/convert/imagesToPdf')
    return imagesToPdf([await prepareImage(file)], { format: 'a4', margin: 28 })
  }
  throw new Error(`„${file.name}“ ist weder PDF noch Bild.`)
}

function pdfFile(data: Uint8Array, name: string) {
  return new File([data.slice()], name, { type: 'application/pdf' })
}

async function compress(
  file: File,
  data: Uint8Array,
  level: CompressionLevel,
): Promise<BatchResult> {
  const { compressPdfData } = await import('@/engine/mupdf/client')
  const result = await compressPdfData(data, level)
  const saved = 1 - result.after / result.before
  // An unchanged copy of a PDF is no result (a picture turned into a PDF is)
  if (saved < 0.01 && looksLikePdf(file)) {
    return { files: [], note: 'Bereits gut komprimiert – keine neue Datei' }
  }
  return {
    files: [pdfFile(result.data, `${baseName(file.name)} (komprimiert).pdf`)],
    note:
      saved >= 0.01
        ? `${formatFileSize(result.before)} → ${formatFileSize(result.after)} (−${Math.round(saved * 100)} %)`
        : 'Bereits gut komprimiert',
  }
}

async function recognize(
  file: File,
  data: Uint8Array,
  action: Extract<BatchAction, { type: 'ocr' }>,
  { signal, onProgress }: BatchContext,
): Promise<BatchResult> {
  const { recognizePage } = await import('@/features/ocr/recognizePage')
  const { terminateOcr } = await import('@/engine/ocr/tesseract')
  const { buildOcrPdf } = await import('@/engine/ocr/textLayer')
  const stop = () => void terminateOcr()
  signal.addEventListener('abort', stop)
  const pdf = await openPdf(data)
  try {
    const targets = []
    let recognized = 0
    for (let number = 1; number <= pdf.numPages; number++) {
      aborted(signal)
      const result = await recognizePage(pdf, number, action.languages, {
        skipPagesWithText: action.skipPagesWithText,
        onProgress: (value) => onProgress((number - 1 + value) / pdf.numPages),
        signal,
      })
      const page = await pdf.getPage(number)
      if (result.status === 'recognized') recognized++
      targets.push({
        sourceId: 'source',
        sourceIndex: number - 1,
        rotate: page.rotate,
        ocr: result.status === 'recognized' ? result.ocr : EMPTY_OCR,
      })
    }
    if (recognized === 0) {
      return { files: [], note: 'Kein neuer Text erkannt (schon Text vorhanden oder leer)' }
    }
    const output = await buildOcrPdf(targets, new Map([['source', { data }]]))
    return {
      files: [pdfFile(output, `${baseName(file.name)} (OCR).pdf`)],
      note: `Text auf ${recognized} von ${pdf.numPages} ${pdf.numPages === 1 ? 'Seite' : 'Seiten'} erkannt`,
    }
  } finally {
    signal.removeEventListener('abort', stop)
    void closePdf(pdf)
  }
}

async function images(
  file: File,
  data: Uint8Array,
  action: Extract<BatchAction, { type: 'images' }>,
  { signal, onProgress }: BatchContext,
): Promise<BatchResult> {
  const { renderPdfPages } = await import('@/features/convert/renderImages')
  const pdf = await openPdf(data)
  try {
    const pages = Array.from({ length: pdf.numPages }, (_, index) => ({ index, number: index + 1 }))
    const files = await renderPdfPages(
      pdf,
      pages,
      {
        format: action.format,
        dpi: action.dpi,
        name: baseName(file.name),
        digits: String(pdf.numPages).length,
      },
      (done, total) => onProgress(done / total),
      signal,
    )
    return { files, note: `${files.length} ${files.length === 1 ? 'Bild' : 'Bilder'}` }
  } finally {
    void closePdf(pdf)
  }
}

/** Structured text and tables of a PDF (read with MuPDF), as for the data export. */
export async function documentData(
  name: string,
  data: Uint8Array,
  { signal, onProgress }: BatchContext,
): Promise<DocumentData> {
  const { readPageContent, closeTextSource } = await import('@/engine/mupdf/client')
  const pdf = await openPdf(data)
  const source = { id: `batch:${crypto.randomUUID()}`, data }
  try {
    const sizes = await getPageSizes(pdf)
    const pages = []
    for (const [index, size] of sizes.entries()) {
      aborted(signal)
      const turns = Math.round((size.rotate ?? 0) / 90)
      const raw = await readPageContent(source, index)
      const lines = pageTextLines(
        toEditableLines(raw, size.rotate ?? 0),
        { id: String(index), sourceId: source.id, sourceIndex: index, rotation: 0 },
        unrotatedSize(size, turns),
      )
      pages.push({ number: index + 1, lines })
      onProgress((index + 1) / sizes.length)
    }
    const body = bodyFontSize(pages.flatMap((page) => page.lines))
    return {
      name,
      pageCount: sizes.length,
      pages: pages.map(({ number, lines }) => ({ number, blocks: structureLines(lines, body) })),
      comments: [],
    }
  } finally {
    void closePdf(pdf)
    void closeTextSource(source.id)
  }
}

async function extractData(
  file: File,
  data: Uint8Array,
  format: DataFormat,
  context: BatchContext,
): Promise<BatchResult> {
  const { buildDataFiles } = await import('@/engine/export/dataFiles')
  const { dataSummary } = await import('@/engine/export/dataExport')
  const extracted = await documentData(file.name, data, context)
  const summary = dataSummary(extracted)
  if (summary.blocks === 0 && summary.tables === 0) {
    return { files: [], note: 'Kein Text gefunden – zuerst Texterkennung ausführen' }
  }
  const files = await buildDataFiles(
    extracted,
    { text: true, tables: true, comments: false },
    format,
    baseName(file.name),
  )
  return {
    files,
    note: `${summary.blocks} ${summary.blocks === 1 ? 'Abschnitt' : 'Abschnitte'}, ${summary.tables} ${summary.tables === 1 ? 'Tabelle' : 'Tabellen'}`,
  }
}

/** Runs one action on one file (merging is done for all files at once, see `mergeFiles`). */
export async function processFile(
  file: File,
  action: Exclude<BatchAction, { type: 'merge' }>,
  context: BatchContext,
): Promise<BatchResult> {
  const data = await toPdfBytes(file)
  aborted(context.signal)
  switch (action.type) {
    case 'compress':
      return compress(file, data, action.level)
    case 'ocr':
      return recognize(file, data, action, context)
    case 'images':
      return images(file, data, action, context)
    case 'data':
      return extractData(file, data, action.format, context)
  }
}

/** Joins all files (PDFs and pictures) into one PDF, in the given order. */
export async function mergeFiles(
  files: readonly File[],
  onFile: (index: number, error?: Error) => void,
  signal: AbortSignal,
): Promise<File | null> {
  const { PDFDocument } = await import('pdf-lib')
  const output = await PDFDocument.create()
  for (const [index, file] of files.entries()) {
    aborted(signal)
    try {
      const source = await PDFDocument.load(await toPdfBytes(file), { ignoreEncryption: true })
      const pages = await output.copyPages(source, source.getPageIndices())
      for (const page of pages) output.addPage(page)
      onFile(index)
    } catch (error) {
      onFile(index, error as Error)
    }
  }
  if (output.getPageCount() === 0) return null
  output.setProducer('Doxera')
  return pdfFile(await output.save(), 'Zusammengeführt.pdf')
}
