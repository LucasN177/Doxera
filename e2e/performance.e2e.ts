import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { zlibSync } from 'fflate'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const PAGES = Number(process.env.PERF_PAGES ?? 300)

/** A noisy gray PNG (compresses badly, like a photo or scan). */
function noisePng(width: number, height: number, seed: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    out.set(
      Array.from(type, (char) => char.charCodeAt(0)),
      4,
    )
    out.set(data, 8)
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
    return out
  }
  const header = new Uint8Array(13)
  new DataView(header.buffer).setUint32(0, width)
  new DataView(header.buffer).setUint32(4, height)
  header.set([8, 0, 0, 0, 0], 8)
  const raw = new Uint8Array((width + 1) * height)
  // Real noise doesn't compress, like photos and scans
  for (let offset = 0; offset < raw.length; offset += 65_536) {
    crypto.getRandomValues(raw.subarray(offset, Math.min(raw.length, offset + 65_536)))
  }
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0
  void seed
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw)),
    chunk('IEND', new Uint8Array()),
  ]
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.length
  }
  return png
}

async function largePdf(path: string) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < PAGES; i++) {
    // Every page has its own picture, like a scanned document
    const page = pdf.addPage([595, 842])
    if (!process.env.PERF_TEXT_ONLY) {
      const image = await pdf.embedPng(noisePng(700, 990, i + 1))
      page.drawImage(image, { x: 40, y: 150, width: 515, height: 650 })
    }
    page.drawText(`Seite ${i + 1} von ${PAGES} – Suchwort${i === PAGES - 1 ? ' Ende' : ''}`, {
      x: 40,
      y: 120,
      size: 14,
      font,
    })
  }
  await writeFile(path, await pdf.save())
}

/**
 * Opt-in measurement (`npm run test:perf`): opens a large generated PDF and
 * times the main actions. Too slow for every run: its project only exists when asked for.
 */
test('stays responsive with a large PDF', async ({ page }, info) => {
  test.setTimeout(600_000)
  const path = info.outputPath('large.pdf')
  await largePdf(path)
  const size = (await readFile(path)).length
  const times: Record<string, number> = {}
  const measure = async (name: string, action: () => Promise<unknown>) => {
    const start = Date.now()
    await action()
    times[name] = Date.now() - start
  }

  await page.goto('./')
  await measure('open', async () => {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Datei auswählen' }).click()
    await (await chooser).setFiles(path)
    await expect(page.locator('[data-page-number="1"] canvas')).toBeVisible({ timeout: 120_000 })
  })
  await expect(page.getByText(`/ ${PAGES}`, { exact: true })).toBeVisible()

  await measure('jump to last page', async () => {
    await page.keyboard.press('End')
    await expect(page.locator(`[data-page-number="${PAGES}"] canvas`)).toBeVisible()
  })
  await measure('search', async () => {
    await page.getByRole('button', { name: 'Suchen' }).click()
    await page.keyboard.type('Ende')
    await expect(page.getByText('1 von 1')).toBeVisible({ timeout: 120_000 })
    await page.keyboard.press('Escape')
  })
  await measure('rotate a page', async () => {
    await page.getByRole('button', { name: 'Seite nach rechts drehen' }).click()
  })
  await measure('delete a page', async () => {
    await page.getByRole('button', { name: 'Seite löschen' }).click()
    await expect(page.getByText(`/ ${PAGES - 1}`, { exact: true })).toBeVisible()
  })
  await measure('save', async () => {
    const download = page.waitForEvent('download', { timeout: 300_000 })
    await page.getByRole('button', { name: 'Herunterladen' }).click()
    await (await download).path()
  })
  const memory = await page.evaluate(
    () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory,
  )
  console.log(
    `PERF ${PAGES} pages, ${(size / 1e6).toFixed(1)} MB: ${JSON.stringify(times)} heap ${
      memory ? (memory.usedJSHeapSize / 1e6).toFixed(0) + ' MB' : '?'
    }`,
  )
})
