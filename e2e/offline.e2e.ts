import { expect, test, type Page } from '@playwright/test'
import { downloadPdf, openPdf, pdfText, SAMPLE } from './helpers.ts'

// One long scenario: the service worker and its caches are shared state
test.describe.configure({ mode: 'serial' })

/** A "scan": text drawn into a PNG by the browser (no text layer). */
async function scanImage(page: Page, text: string): Promise<Buffer> {
  const url = await page.evaluate((line) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1240
    canvas.height = 1754
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#111111'
    context.font = '64px Arial'
    context.fillText(line, 120, 300)
    return canvas.toDataURL('image/png')
  }, text)
  return Buffer.from(url.split(',')[1]!, 'base64')
}

/** Makes a PDF from a scanned picture with "Images to PDF" from the start screen. */
async function openScan(page: Page, text: string) {
  const buffer = await scanImage(page, text)
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Bilder zu PDF' }).click()
  await (await chooser).setFiles({ name: 'scan.png', mimeType: 'image/png', buffer })
  await page.getByRole('button', { name: 'Neue PDF erstellen' }).click()
  await expect(page.locator('[data-page-number="1"] canvas')).toBeVisible()
}

async function recognizeText(page: Page) {
  await page.getByRole('button', { name: 'Text erkennen & exportieren' }).click()
  await page.getByRole('menuitem', { name: /Texterkennung/ }).click()
  await page.getByRole('button', { name: 'Text erkennen', exact: true }).click()
  await expect(page.getByText(/Text auf 1 Seite erkannt/)).toBeVisible({ timeout: 120_000 })
}

async function editFirstLine(page: Page, from: string, to: string) {
  await page.getByRole('button', { name: 'Zeichnen & beschriften' }).click()
  await page.getByRole('button', { name: 'Vorhandenen Text & Bilder bearbeiten' }).click()
  const target = page
    .locator('[data-page-number="1"] rect')
    .filter({ has: page.locator('title', { hasText: from }) })
  await target.first().dispatchEvent('pointerdown')
  const editor = page.getByRole('textbox', { name: 'Text', exact: true })
  await editor.fill(to)
  await editor.press('Escape')
  await page.getByRole('button', { name: 'Zeichnen beenden' }).click()
}

test('works offline once prepared, including editing and OCR', async ({ page, context }) => {
  test.setTimeout(300_000)
  await page.goto('./')
  // Wait until the service worker has cached the app and controls the page
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  // MuPDF and text recognition are only cached on use: load them ahead of time
  await page.getByRole('button', { name: /Alles offline verfügbar machen/ }).click()
  await expect(page.getByText('Alle Funktionen sind auch offline verfügbar.')).toBeVisible({
    timeout: 120_000,
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Datei auswählen' })).toBeVisible()

  // Viewing, editing existing text and saving
  await openPdf(page, SAMPLE)
  await editFirstLine(page, 'Rechnungsnummer', 'Rechnungsnummer: RE-OFFLINE')
  expect(pdfText(await downloadPdf(page))[0]).toContain('RE-OFFLINE')
  await page.getByRole('button', { name: 'Dokument schließen' }).click()

  // Pictures to PDF and text recognition on a new scan
  await openScan(page, 'Lieferschein 815 offline')
  await recognizeText(page)
  const text = pdfText(await downloadPdf(page))[0]!
  expect(text).toMatch(/Lieferschein\s+815/)
})
