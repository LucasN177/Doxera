import { buildPdf } from '@/engine/document/buildPdf'
import type { PageRef } from '@/types/document'
import type { WorkflowStep } from '@/types/workflow'

type WatermarkStep = Extract<WorkflowStep, { type: 'watermark' }>

/**
 * Puts a text watermark on every page of a PDF, upright as each page is
 * displayed (its own rotation is taken into account).
 */
export async function watermarkPdf(data: Uint8Array, step: WatermarkStep): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const source = await PDFDocument.load(data, { ignoreEncryption: true })
  const pages: PageRef[] = source.getPages().map((page, index) => ({
    id: String(index),
    sourceId: 'source',
    sourceIndex: index,
    rotation: 0,
    annotations: [
      {
        id: `watermark-${index}`,
        type: 'watermark',
        color: step.color,
        text: step.text,
        size: step.size,
        opacity: step.opacity,
        angle: step.angle,
        turns: Math.round(page.getRotation().angle / 90),
      },
    ],
  }))
  return buildPdf(pages, new Map([['source', { data }]]))
}
