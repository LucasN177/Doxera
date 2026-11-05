import type { PageRect } from './annotations'

/** Entered form values by field name: text for text, choice and radio fields, true/false for checkboxes. */
export type FormValues = Record<string, string | boolean>

interface FieldBase {
  name: string
  /** Position as fractions of the unrotated page (like annotations). */
  rect: PageRect
  readOnly: boolean
}

export type FormField =
  | (FieldBase & { type: 'text'; value: string; multiline: boolean; maxLength: number })
  | (FieldBase & { type: 'checkbox'; value: boolean })
  | (FieldBase & { type: 'radio'; value: string | null; option: string })
  | (FieldBase & {
      type: 'choice'
      value: string
      options: Array<{ value: string; label: string }>
    })
