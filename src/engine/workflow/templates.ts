import { DEFAULT_HEADER_FOOTER } from '@/engine/document/headerFooter'
import type { Workflow, WorkflowStep } from '@/types/workflow'
import { t } from '@/i18n'

/** Default settings of a newly added step. */
export function defaultStep(type: WorkflowStep['type']): WorkflowStep {
  switch (type) {
    case 'ocr':
      return { type, languages: ['deu', 'eng'], skipPagesWithText: true }
    case 'watermark':
      return {
        type,
        text: 'VERTRAULICH',
        color: '#64748b',
        size: 0.7,
        opacity: 0.25,
        angle: 45,
      }
    case 'compress':
      return { type, level: 'medium' }
    case 'headerFooter':
      return { type, settings: DEFAULT_HEADER_FOOTER }
  }
}

type Template = Pick<Workflow, 'name' | 'steps' | 'output'> & { description: string }

/** Ready-made workflows to start from. */
export const WORKFLOW_TEMPLATES: Template[] = [
  {
    name: t('Scan archivieren'),
    description: t('Text erkennen und platzsparend speichern – durchsuchbar im Archiv.'),
    steps: [defaultStep('ocr'), defaultStep('compress')],
    output: { type: 'pdf' },
  },
  {
    name: t('Für E-Mail verkleinern'),
    description: t('Stark komprimieren, damit die PDF in jedes Postfach passt.'),
    steps: [{ type: 'compress', level: 'strong' }],
    output: { type: 'pdf' },
  },
  {
    name: t('Vertraulich markieren'),
    description: t('Wasserzeichen „VERTRAULICH“ auf allen Seiten, dann komprimieren.'),
    steps: [defaultStep('watermark'), defaultStep('compress')],
    output: { type: 'pdf' },
  },
  {
    name: t('Tabellen nach Excel'),
    description: t('Scans erkennen und Text sowie Tabellen als Excel-Datei ausgeben.'),
    steps: [defaultStep('ocr')],
    output: { type: 'data', format: 'xlsx' },
  },
]

/** Human-readable summary of a workflow, e.g. "Texterkennung → Komprimieren → PDF". */
export function describeWorkflow(workflow: Pick<Workflow, 'steps' | 'output'>): string {
  const names = {
    ocr: t('Texterkennung'),
    watermark: t('Wasserzeichen'),
    compress: t('Komprimieren'),
    headerFooter: t('Seitenzahlen'),
  }
  const outputs = { pdf: 'PDF', images: t('Bilder'), data: t('Daten') }
  const output =
    workflow.output.type === 'data'
      ? t('Daten ({value0})', {
          value0:
            workflow.output.format === 'xlsx' ? t('Excel') : workflow.output.format.toUpperCase(),
        })
      : outputs[workflow.output.type]
  return [...workflow.steps.map((step) => names[step.type]), output].join(' → ')
}
