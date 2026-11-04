import type { Workflow, WorkflowStep } from '@/types/workflow'

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
  }
}

type Template = Pick<Workflow, 'name' | 'steps' | 'output'> & { description: string }

/** Ready-made workflows to start from. */
export const WORKFLOW_TEMPLATES: Template[] = [
  {
    name: 'Scan archivieren',
    description: 'Text erkennen und platzsparend speichern – durchsuchbar im Archiv.',
    steps: [defaultStep('ocr'), defaultStep('compress')],
    output: { type: 'pdf' },
  },
  {
    name: 'Für E-Mail verkleinern',
    description: 'Stark komprimieren, damit die PDF in jedes Postfach passt.',
    steps: [{ type: 'compress', level: 'strong' }],
    output: { type: 'pdf' },
  },
  {
    name: 'Vertraulich markieren',
    description: 'Wasserzeichen „VERTRAULICH“ auf allen Seiten, dann komprimieren.',
    steps: [defaultStep('watermark'), defaultStep('compress')],
    output: { type: 'pdf' },
  },
  {
    name: 'Tabellen nach Excel',
    description: 'Scans erkennen und Text sowie Tabellen als Excel-Datei ausgeben.',
    steps: [defaultStep('ocr')],
    output: { type: 'data', format: 'xlsx' },
  },
]

/** Human-readable summary of a workflow, e.g. "Texterkennung → Komprimieren → PDF". */
export function describeWorkflow(workflow: Pick<Workflow, 'steps' | 'output'>): string {
  const names = { ocr: 'Texterkennung', watermark: 'Wasserzeichen', compress: 'Komprimieren' }
  const outputs = { pdf: 'PDF', images: 'Bilder', data: 'Daten' }
  const output =
    workflow.output.type === 'data'
      ? `Daten (${workflow.output.format === 'xlsx' ? 'Excel' : workflow.output.format.toUpperCase()})`
      : outputs[workflow.output.type]
  return [...workflow.steps.map((step) => names[step.type]), output].join(' → ')
}
