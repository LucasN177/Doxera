import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import * as mupdf from 'mupdf'
import { readFile } from 'node:fs/promises'
import { downloadPdf, pdfText, SAMPLE } from './helpers.ts'

/** The sample PDF, encrypted with a password. */
async function protectedSample(path: string) {
  const document = new mupdf.PDFDocument(new Uint8Array(await readFile(SAMPLE)))
  const buffer = document.saveToBuffer('encrypt=aes-256,user-password=geheim,owner-password=geheim')
  await writeFile(path, buffer.asUint8Array().slice())
  buffer.destroy()
  document.destroy()
}

test('opens a password-protected PDF after asking for the password', async ({ page }, info) => {
  const path = info.outputPath('geschuetzt.pdf')
  await protectedSample(path)
  await page.goto('./')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Datei auswählen' }).click()
  await (await chooser).setFiles(path)

  const password = page.getByRole('dialog').getByLabel('Passwort')
  await password.fill('falsch')
  await page.getByRole('button', { name: 'Entsperren' }).click()
  await expect(page.getByText('Das Passwort ist falsch.', { exact: false })).toBeVisible()
  await password.fill('geheim')
  await page.getByRole('button', { name: 'Entsperren' }).click()
  await expect(page.locator('[data-page-number="1"] canvas')).toBeVisible()

  // The unlocked document can be edited and saved
  await page.getByRole('button', { name: 'Seite löschen' }).click()
  expect(pdfText(await downloadPdf(page))).toHaveLength(4)
})
