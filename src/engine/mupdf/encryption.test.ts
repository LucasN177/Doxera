// @vitest-environment node
import * as mupdf from 'mupdf'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { decryptPdf, encryptPdf, isEncrypted, permissionFlags } from './encryption'

async function plainPdf() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.addPage([300, 200]).drawText('Geheim 4711', { x: 20, y: 100, size: 18, font })
  return pdf.save()
}

function text(data: Uint8Array) {
  const document = new mupdf.PDFDocument(data)
  try {
    return document.loadPage(0).toStructuredText('preserve-whitespace').asText().trim()
  } finally {
    document.destroy()
  }
}

const options = { userPassword: 'öffnen 123', allowPrint: true, allowCopy: false, allowEdit: false }

describe('encryption', { timeout: 30_000 }, () => {
  it('encrypts with a password and decrypts only with the right one', async () => {
    const plain = await plainPdf()
    expect(isEncrypted(plain)).toBe(false)
    const encrypted = encryptPdf(mupdf, plain, options)
    expect(isEncrypted(encrypted)).toBe(true)

    expect(decryptPdf(mupdf, encrypted, 'falsch')).toEqual({ status: 'password' })
    const result = decryptPdf(mupdf, encrypted, 'öffnen 123')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(isEncrypted(result.data)).toBe(false)
    expect(text(result.data)).toBe('Geheim 4711')
  })

  it('decrypts files that only restrict editing without a password', async () => {
    const document = new mupdf.PDFDocument(await plainPdf())
    const restricted = document
      .saveToBuffer('encrypt=aes-256,owner-password=chef,permissions=-3904')
      .asUint8Array()
      .slice()
    document.destroy()
    const result = decryptPdf(mupdf, restricted, '')
    expect(result.status).toBe('ok')
  })

  it('computes permission flags and rejects unusable passwords', async () => {
    expect(permissionFlags({ ...options, allowCopy: true, allowEdit: true })).toBe(-4)
    expect(permissionFlags(options) & 16).toBe(0)
    expect(permissionFlags(options) & 4).toBe(4)
    expect(() => encryptPdf(mupdf, new Uint8Array(), { ...options, userPassword: 'a,b' })).toThrow(
      'Komma',
    )
  })
})
