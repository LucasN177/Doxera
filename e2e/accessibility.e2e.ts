import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openPdf, SAMPLE } from './helpers.ts'

/** WCAG 2.1 A/AA problems on the current screen (the PDF canvas itself is content, not UI). */
async function violations(page: Page) {
  // Fading dialogs are briefly translucent: measure contrast once they're settled
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return result.violations.map((violation) => ({
    id: violation.id,
    help: violation.help,
    nodes: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')),
  }))
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('start screen', async ({ page }) => {
      await page.goto('./')
      await expect(page.getByRole('button', { name: 'Datei auswählen' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('open document', async ({ page }) => {
      await page.goto('./')
      await openPdf(page, SAMPLE)
      expect(await violations(page)).toEqual([])
    })

    test('drawing tools', async ({ page }) => {
      await page.goto('./')
      await openPdf(page, SAMPLE)
      await page.getByRole('button', { name: 'Zeichnen & beschriften' }).click()
      expect(await violations(page)).toEqual([])
    })

    test('page overview', async ({ page }) => {
      await page.goto('./')
      await openPdf(page, SAMPLE)
      await page.getByRole('button', { name: 'Seitenübersicht' }).click()
      expect(await violations(page)).toEqual([])
    })

    test('dialogs', async ({ page }) => {
      await page.goto('./')
      await openPdf(page, SAMPLE)
      for (const [menu, item] of [
        ['Werkzeuge', /Seitenzahlen/],
        ['Werkzeuge', /PDF komprimieren/],
        ['Werkzeuge', /Mit Passwort schützen/],
        ['Werkzeuge', /Daten exportieren/],
        ['Text erkennen & exportieren', /Texterkennung/],
      ] as const) {
        await page.getByRole('button', { name: menu }).click()
        await page.getByRole('menuitem', { name: item }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        expect(await violations(page), String(item)).toEqual([])
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()
      }
    })
  })
}

test('can be used with the keyboard alone', async ({ page }) => {
  await page.goto('./')
  await openPdf(page, SAMPLE)
  // Shortcuts work from the document
  await page.locator('[aria-label="Dokumentansicht"]').focus()
  await page.keyboard.press('n')
  await expect(page.getByLabel('Seitennummer')).toHaveValue('2')
  // A menu opens, is navigated and closed with the keyboard; focus returns to its button
  const tools = page.getByRole('button', { name: 'Werkzeuge' })
  await tools.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(tools).toBeFocused()
  // Dialogs keep the focus inside and give it back when closed
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: /Seitenzahlen/ }).press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab')
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(tools).toBeFocused()
})
