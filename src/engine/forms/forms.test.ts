import { PDFDocument } from 'pdf-lib'
import { buildPdf } from '@/engine/document/buildPdf'
import { toFormFields } from './fields'
import { fillFormPdf } from './fill'

async function formPdf() {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const form = pdf.getForm()
  form.createTextField('name').addToPage(page, { x: 100, y: 700, width: 200, height: 20 })
  form.createCheckBox('agree').addToPage(page, { x: 100, y: 560, width: 14, height: 14 })
  const size = form.createRadioGroup('size')
  size.addOptionToPage('S', page, { x: 100, y: 520, width: 14, height: 14 })
  size.addOptionToPage('L', page, { x: 140, y: 520, width: 14, height: 14 })
  const country = form.createDropdown('country')
  country.addOptions(['DE', 'AT', 'CH'])
  country.addToPage(page, { x: 100, y: 480, width: 100, height: 20 })
  return pdf.save()
}

const values = { name: 'Erika Mustermann', agree: true, size: 'L', country: 'CH' }

describe('form fields', () => {
  it('reads pdf.js widgets as fields with page fractions', () => {
    const fields = toFormFields(
      [
        {
          subtype: 'Widget',
          fieldType: 'Tx',
          fieldName: 'name',
          fieldValue: 'Max',
          rect: [100, 700, 300, 720],
        },
        {
          subtype: 'Widget',
          fieldType: 'Btn',
          fieldName: 'agree',
          fieldValue: 'Off',
          checkBox: true,
          rect: [100, 560, 114, 574],
        },
        {
          subtype: 'Widget',
          fieldType: 'Btn',
          fieldName: 'size',
          fieldValue: 'L',
          radioButton: true,
          buttonValue: 'S',
          rect: [0, 0, 1, 1],
        },
        {
          subtype: 'Widget',
          fieldType: 'Btn',
          fieldName: 'ok',
          pushButton: true,
          rect: [0, 0, 1, 1],
        },
        { subtype: 'Link', rect: [0, 0, 1, 1] },
      ],
      [0, 0, 595, 842],
    )
    expect(fields.map((field) => [field.type, field.name, field.value])).toEqual([
      ['text', 'name', 'Max'],
      ['checkbox', 'agree', false],
      ['radio', 'size', 'L'],
    ])
    expect(fields[0].rect.a.x).toBeCloseTo(100 / 595, 4)
    expect(fields[0].rect.a.y).toBeCloseTo(1 - 720 / 842, 4)
  })

  it('fills the form and keeps it fillable', async () => {
    const result = await PDFDocument.load(await fillFormPdf(await formPdf(), values))
    const form = result.getForm()
    expect(form.getTextField('name').getText()).toBe('Erika Mustermann')
    expect(form.getCheckBox('agree').isChecked()).toBe(true)
    expect(form.getRadioGroup('size').getSelected()).toBe('L')
    expect(form.getDropdown('country').getSelected()).toEqual(['CH'])
  })

  it('draws the values into rebuilt documents (no fields left)', async () => {
    const data = await formPdf()
    const pages = [{ id: 'p', sourceId: 's', sourceIndex: 0, rotation: 90 as const }]
    const result = await buildPdf(pages, new Map([['s', { data }]]), {
      forms: { sourceId: 's', values },
    })
    const pdf = await PDFDocument.load(result)
    expect(pdf.getForm().getFields()).toHaveLength(0)
    expect(pdf.getPage(0).getRotation().angle).toBe(90)
  })
})

describe('multiline fields', () => {
  it('uses a readable size for automatically sized multiline fields', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595, 842])
    const notes = pdf.getForm().createTextField('notes')
    notes.enableMultiline()
    notes.addToPage(page, { x: 100, y: 600, width: 300, height: 70 })
    const result = await PDFDocument.load(
      await fillFormPdf(await pdf.save(), { notes: 'Bitte vegetarisches Essen.' }),
    )
    const appearance = result.getForm().getTextField('notes').acroField.getDefaultAppearance()
    expect(appearance).toMatch(/11 Tf/)
  })
})
