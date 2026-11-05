import {
  baseName,
  ocrNote,
  ocrPdf,
  pdfFile,
  pdfToDataFiles,
  pdfToImageFiles,
  type BatchContext,
  type BatchResult,
} from '@/features/batch/processors'
import { formatFileSize } from '@/lib/file'
import type { Workflow } from '@/types/workflow'

/**
 * Runs a workflow on a PDF: its steps one after another (each gets the
 * previous step's PDF), then the output (PDF, images or data files).
 */
export async function runWorkflow(
  name: string,
  input: Uint8Array,
  workflow: Workflow,
  { signal, onProgress }: BatchContext,
): Promise<BatchResult> {
  const parts = workflow.steps.length + 1
  const part = (index: number): BatchContext => ({
    signal,
    onProgress: (value) => onProgress((index + value) / parts),
  })
  const notes: string[] = []
  let data = input

  for (const [index, step] of workflow.steps.entries()) {
    if (signal.aborted) throw new DOMException('Abgebrochen', 'AbortError')
    if (step.type === 'ocr') {
      const result = await ocrPdf(data, step, part(index))
      data = result.data
      if (result.recognized > 0) notes.push(ocrNote(result.recognized, result.pages))
    } else if (step.type === 'watermark') {
      const { watermarkPdf } = await import('@/engine/workflow/watermark')
      data = await watermarkPdf(data, step)
      notes.push('Wasserzeichen')
    } else if (step.type === 'headerFooter') {
      const { stampPdf } = await import('@/engine/document/stampPdf')
      data = await stampPdf(data, step.settings, name)
      notes.push('Seitenzahlen')
    } else {
      const { compressPdfData } = await import('@/engine/mupdf/client')
      const before = data.length
      data = (await compressPdfData(data, step.level)).data
      if (data.length < before * 0.99) {
        notes.push(`${formatFileSize(before)} → ${formatFileSize(data.length)}`)
      }
    }
    onProgress((index + 1) / parts)
  }

  const base = baseName(name)
  const output = workflow.output
  if (output.type === 'images') {
    const files = await pdfToImageFiles(data, base, output, part(parts - 1))
    notes.push(`${files.length} ${files.length === 1 ? 'Bild' : 'Bilder'}`)
    return { files, note: notes.join(' · ') }
  }
  if (output.type === 'data') {
    const result = await pdfToDataFiles(name, data, output.format, part(parts - 1))
    return { files: result.files, note: [...notes, result.note].join(' · ') }
  }
  onProgress(1)
  return {
    files: [pdfFile(data, `${base} (${workflow.name}).pdf`)],
    note: notes.join(' · ') || 'Fertig',
  }
}
