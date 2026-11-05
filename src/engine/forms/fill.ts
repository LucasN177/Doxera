import type { PDFDocument } from 'pdf-lib'
import { embedUnicodeFont, needsUnicode } from '@/engine/fonts/unicodeFont'
import type { FormValues } from '@/types/forms'

type PdfLib = typeof import('pdf-lib')

/**
 * Writes form values into a loaded PDF (pdf-lib). Unknown fields and values
 * that don't fit a field are skipped. With `flatten`, the values are drawn
 * into the pages and the fields removed (needed when pages are rearranged,
 * since the form structure can't follow copied pages).
 */
export async function fillForm(
  lib: PdfLib,
  document: PDFDocument,
  values: FormValues,
  flatten: boolean,
) {
  const { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts } =
    lib
  const form = document.getForm()
  for (const [name, value] of Object.entries(values)) {
    let field
    try {
      field = form.getField(name)
    } catch {
      continue
    }
    try {
      if (field instanceof PDFTextField && typeof value === 'string') {
        field.setText(value)
        // Multiline fields without a size (0 = automatic) or with an oversized one
        // (pdf-lib writes the size that fills the box) cut text off: use a readable size
        const appearance = field.acroField.getDefaultAppearance() ?? ''
        const size = Number(/([\d.]+)\s+Tf/.exec(appearance)?.[1] ?? 0)
        if (field.isMultiline() && (!size || size > 24)) field.setFontSize(11)
      } else if (field instanceof PDFCheckBox) {
        if (value === true) field.check()
        else field.uncheck()
      } else if (field instanceof PDFRadioGroup && typeof value === 'string') field.select(value)
      else if (
        (field instanceof PDFDropdown || field instanceof PDFOptionList) &&
        typeof value === 'string'
      ) {
        field.select(value)
      }
    } catch (error) {
      console.warn(`Formularfeld „${name}“ konnte nicht gesetzt werden`, error)
    }
  }
  const unicode = Object.values(values).some(
    (value) => typeof value === 'string' && needsUnicode(value),
  )
  const font = unicode
    ? await embedUnicodeFont(document)
    : await document.embedFont(StandardFonts.Helvetica)
  try {
    form.updateFieldAppearances(font)
  } catch (error) {
    // Characters the standard font can't show: keep what the fields had
    console.warn('Formular-Darstellung konnte nicht aktualisiert werden', error)
  }
  if (flatten) form.flatten()
}

/** A copy of a PDF with filled form fields (still fillable unless flattened). */
export async function fillFormPdf(
  data: Uint8Array,
  values: FormValues,
  flatten = false,
): Promise<Uint8Array> {
  const lib = await import('pdf-lib')
  const document = await lib.PDFDocument.load(data, { ignoreEncryption: true })
  await fillForm(lib, document, values, flatten)
  return document.save()
}
