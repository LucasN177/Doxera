import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { FormField } from '@/types/forms'

/** The parts of pdf.js widget annotation data that are used. */
interface WidgetData {
  subtype?: string
  fieldType?: string
  fieldName?: string
  fieldValue?: unknown
  rect?: number[]
  readOnly?: boolean
  multiLine?: boolean
  maxLen?: number
  checkBox?: boolean
  radioButton?: boolean
  pushButton?: boolean
  buttonValue?: string
  options?: Array<{ exportValue: string; displayValue: string }>
}

/**
 * Turns pdf.js widget annotations into fillable fields with positions as
 * fractions of the page (view box: x0, y0, x1, y1 in PDF user space).
 * Push buttons, signature fields and unnamed fields are left out.
 */
export function toFormFields(
  annotations: readonly WidgetData[],
  view: readonly number[],
): FormField[] {
  const [vx0, vy0, vx1, vy1] = view
  const width = vx1 - vx0
  const height = vy1 - vy0
  const fields: FormField[] = []
  for (const item of annotations) {
    if (item.subtype !== 'Widget' || !item.fieldName || !item.rect) continue
    const [x0, y0, x1, y1] = item.rect
    const rect = {
      a: { x: (Math.min(x0, x1) - vx0) / width, y: 1 - (Math.max(y0, y1) - vy0) / height },
      b: { x: (Math.max(x0, x1) - vx0) / width, y: 1 - (Math.min(y0, y1) - vy0) / height },
    }
    const base = { name: item.fieldName, rect, readOnly: !!item.readOnly }
    if (item.fieldType === 'Tx') {
      fields.push({
        ...base,
        type: 'text',
        value: typeof item.fieldValue === 'string' ? item.fieldValue : '',
        multiline: !!item.multiLine,
        maxLength: item.maxLen ?? 0,
      })
    } else if (item.fieldType === 'Btn' && item.checkBox) {
      fields.push({
        ...base,
        type: 'checkbox',
        value: !!item.fieldValue && item.fieldValue !== 'Off',
      })
    } else if (item.fieldType === 'Btn' && item.radioButton && item.buttonValue) {
      const value =
        typeof item.fieldValue === 'string' && item.fieldValue !== 'Off' ? item.fieldValue : null
      fields.push({ ...base, type: 'radio', value, option: item.buttonValue })
    } else if (item.fieldType === 'Ch' && item.options) {
      const value = Array.isArray(item.fieldValue)
        ? String(item.fieldValue[0] ?? '')
        : String(item.fieldValue ?? '')
      fields.push({
        ...base,
        type: 'choice',
        value,
        options: item.options.map((option) => ({
          value: option.exportValue,
          label: option.displayValue,
        })),
      })
    }
  }
  return fields
}

/** Fillable fields of a page (1-based number). */
export async function readFormFields(
  pdf: PDFDocumentProxy,
  pageNumber: number,
): Promise<FormField[]> {
  const page = await pdf.getPage(pageNumber)
  const annotations = (await page.getAnnotations({ intent: 'display' })) as WidgetData[]
  return toFormFields(annotations, page.view)
}
