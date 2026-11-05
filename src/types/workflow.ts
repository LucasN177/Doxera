import type { HeaderFooter } from '@/engine/document/headerFooter'
import type { DataFormat } from '@/engine/export/dataFiles'
import type { CompressionLevel } from '@/engine/mupdf/compress'
import type { OcrLanguage } from '@/engine/ocr/tesseract'

/** A step that turns a PDF into a changed PDF. */
export type WorkflowStep =
  | { type: 'ocr'; languages: OcrLanguage[]; skipPagesWithText: boolean }
  | {
      type: 'watermark'
      text: string
      color: string
      /** Width as fraction of the page width. */
      size: number
      opacity: number
      angle: number
    }
  | { type: 'compress'; level: CompressionLevel }
  | { type: 'headerFooter'; settings: HeaderFooter }

/** What a workflow hands out at the end. */
export type WorkflowOutput =
  | { type: 'pdf' }
  | { type: 'images'; format: 'png' | 'jpeg'; dpi: number }
  | { type: 'data'; format: DataFormat }

export interface Workflow {
  id: string
  name: string
  steps: WorkflowStep[]
  output: WorkflowOutput
  createdAt: number
  updatedAt: number
}
