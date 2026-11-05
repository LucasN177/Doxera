import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import * as mupdf from 'mupdf'

export const SAMPLE = 'tests/fixtures/sample.pdf'
export const LARGE = 'tests/fixtures/large-200-pages.pdf'

/** Opens a PDF through the "choose file" button of the start screen. */
export async function openPdf(page: Page, path: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Datei auswählen' }).click()
  await (await chooser).setFiles(path)
  await expect(page.locator('[data-page-number="1"] canvas')).toBeVisible()
}

/** Clicks "download" and returns the saved PDF's bytes. */
export async function downloadPdf(page: Page): Promise<Uint8Array> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Herunterladen' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.pdf$/)
  return new Uint8Array(await readFile(await file.path()))
}

/** The text of each page of a PDF (MuPDF). */
export function pdfText(data: Uint8Array): string[] {
  const document = new mupdf.PDFDocument(data)
  try {
    return Array.from({ length: document.countPages() }, (_, index) => {
      const page = document.loadPage(index)
      const text = page.toStructuredText('preserve-whitespace').asText()
      page.destroy()
      return text
    })
  } finally {
    document.destroy()
  }
}
