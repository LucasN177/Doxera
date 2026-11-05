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
      /** Picture instead of the text. */
      image?: WorkflowImage
      color: string
      /** Width as fraction of the page width. */
      size: number
      opacity: number
      angle: number
    }
  | { type: 'compress'; level: CompressionLevel }
  | { type: 'headerFooter'; settings: HeaderFooter }

/** A picture kept inside a saved workflow. */
export interface WorkflowImage {
  mimeType: 'image/png' | 'image/jpeg'
  data: Uint8Array
  width: number
  height: number
}

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
