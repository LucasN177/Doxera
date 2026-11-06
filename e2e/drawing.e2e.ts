import { expect, test, type Page } from '@playwright/test'
import { openPdf, SAMPLE } from './helpers.ts'

/** A one-finger drag with real touch events (as on a phone or tablet). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: point(from.x, from.y),
  })
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(
        from.x + ((to.x - from.x) * i) / steps,
        from.y + ((to.y - from.y) * i) / steps,
      ),
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('draws a vertical stroke with one finger instead of scrolling', async ({ page }) => {
  await page.goto('./')
  await openPdf(page, SAMPLE)
  await page.getByRole('button', { name: 'Zeichnen & beschriften' }).tap()
  await page.getByRole('button', { name: 'Stift (freihand)' }).tap()

  const scroller = page.locator('[aria-label="Dokumentansicht"]')
  const before = await scroller.evaluate((element) => element.scrollTop)
  const box = (await page.locator('[data-page-number="1"]').boundingBox())!
  // Over the page's text, where a stroke is most likely to start
  const x = box.x + box.width * 0.3
  await touchDrag(page, { x, y: box.y + 140 }, { x, y: box.y + 340 })

  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(before)
  await expect(page.locator('[data-page-number="1"] svg path')).not.toHaveCount(0)

  // Safari on iPhone/iPad ignores touch-action here: the surface itself must stop
  // one-finger scrolling, while two fingers stay free for pinch-zoom and scrolling
  const prevented = await page
    .locator('[data-page-number="1"] svg[data-annotation-layer]')
    .evaluate((svg) => {
      const move = (fingers: number) => {
        const touches = Array.from(
          { length: fingers },
          (_, i) => new Touch({ identifier: i, target: svg, clientX: 100 + i * 40, clientY: 200 }),
        )
        const event = new TouchEvent('touchmove', { touches, cancelable: true, bubbles: true })
        svg.dispatchEvent(event)
        return event.defaultPrevented
      }
      return { one: move(1), two: move(2) }
    })
  expect(prevented).toEqual({ one: true, two: false })
})
