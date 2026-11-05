import { expect, test } from '@playwright/test'
import { downloadPdf, openPdf, pdfText, SAMPLE } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('opens a PDF and moves between pages', async ({ page }) => {
  await openPdf(page, SAMPLE)
  const pageNumber = page.getByLabel('Seitennummer')
  await expect(pageNumber).toHaveValue('1')
  await expect(page.getByText('/ 5', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Nächste Seite' }).click()
  await expect(pageNumber).toHaveValue('2')
})

test('deletes a page, undoes it and saves the result', async ({ page }) => {
  await openPdf(page, SAMPLE)
  await page.getByRole('button', { name: 'Seite löschen' }).click()
  await expect(page.getByText('/ 4', { exact: true })).toBeVisible()
  await page.getByLabel('Rückgängig').click()
  await expect(page.getByText('/ 5', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Seite löschen' }).click()
  const pages = pdfText(await downloadPdf(page))
  expect(pages).toHaveLength(4)
  expect(pages[0]).toContain('Seite 2')
})

test('adds a text box that ends up in the saved PDF', async ({ page }) => {
  await openPdf(page, SAMPLE)
  await page.getByRole('button', { name: 'Zeichnen & beschriften' }).click()
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  const first = page.locator('[data-page-number="1"]')
  await first.click({ position: { x: 80, y: 300 } })
  await page.keyboard.type('Geprüft von Doxera')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Zeichnen beenden' }).click()
  expect(pdfText(await downloadPdf(page))[0]).toContain('Geprüft von Doxera')
})

test('edits existing text', async ({ page }) => {
  await openPdf(page, SAMPLE)
  await page.getByRole('button', { name: 'Zeichnen & beschriften' }).click()
  await page.getByRole('button', { name: 'Vorhandenen Text & Bilder bearbeiten' }).click()
  const target = page.locator('[data-page-number="1"] rect').filter({
    has: page.locator('title', { hasText: 'Rechnungsnummer' }),
  })
  await target.first().dispatchEvent('pointerdown')
  const editor = page.getByRole('textbox', { name: 'Text', exact: true })
  await expect(editor).toBeVisible()
  await editor.press('End')
  await editor.pressSequentially(' (bezahlt)')
  await editor.press('Escape')
  await page.getByRole('button', { name: 'Zeichnen beenden' }).click()
  const text = pdfText(await downloadPdf(page))[0]!
  expect(text).toContain('1.234,56 EUR (bezahlt)')
  // The original line is gone, not just covered
  expect(text.match(/Rechnungsnummer/g)).toHaveLength(1)
})

test('keeps edits locally and restores them after a reload', async ({ page }) => {
  await openPdf(page, SAMPLE)
  await page.getByRole('button', { name: 'Seite löschen' }).click()
  await expect(page.getByText('/ 4', { exact: true })).toBeVisible()
  // Saved shortly after the change
  await page.waitForTimeout(1500)
  await page.reload()
  await page
    .getByRole('button', { name: /sample\.pdf/ })
    .first()
    .click()
  await expect(page.getByText(/Bearbeitungen wurden wiederhergestellt/)).toBeVisible()
  await expect(page.getByText('/ 4', { exact: true })).toBeVisible()
})

test('finds text with the search', async ({ page }) => {
  await openPdf(page, SAMPLE)
  await page.getByRole('button', { name: 'Suchen' }).click()
  await page.keyboard.type('Querformat')
  await expect(page.getByText('1 von 1')).toBeVisible()
})
