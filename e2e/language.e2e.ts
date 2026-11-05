import { expect, test } from '@playwright/test'
import { SAMPLE } from './helpers.ts'

test.describe('English browser', () => {
  test.use({ locale: 'en-US' })

  test('shows the interface in English and works as usual', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(
      page.getByText('Your documents are processed only locally in your browser.'),
    ).toBeVisible()

    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Choose file' }).click()
    await (await chooser).setFiles(SAMPLE)
    await expect(page.locator('[data-page-number="1"] canvas')).toBeVisible()
    await expect(page.getByLabel('Page number')).toHaveValue('1')

    await page.getByRole('button', { name: 'Delete page' }).click()
    await expect(page.getByText('Page deleted.')).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  })

  test('switches to German and back', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /Auf Deutsch umstellen/ }).click()
    await expect(page.getByRole('button', { name: 'Datei auswählen' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'de')
    // The choice is kept across visits
    await page.reload()
    await expect(page.getByRole('button', { name: 'Datei auswählen' })).toBeVisible()
    await page.getByRole('button', { name: /Switch to English/ }).click()
    await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible()
  })
})

test('German stays German', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'Datei auswählen' })).toBeVisible()
})
