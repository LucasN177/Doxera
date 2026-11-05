import { expect, test } from '@playwright/test'
import { openPdf, SAMPLE } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await openPdf(page, SAMPLE)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  await expect(page.getByRole('button', { name: 'Herunterladen' })).toBeVisible()
})

test('shows all pages in the overview and opens one with a double tap', async ({ page }) => {
  await openPdf(page, SAMPLE)
  await page.getByRole('button', { name: 'Seitenübersicht' }).tap()
  const thumbnails = page.getByRole('button', { name: /^Seite \d+(, ausgewählt)?$/ })
  await expect(thumbnails).toHaveCount(5)
  // Double tap opens the page
  await thumbnails.nth(2).tap()
  await thumbnails.nth(2).tap()
  await expect(page.getByLabel('Seitennummer')).toHaveValue('3')
})
