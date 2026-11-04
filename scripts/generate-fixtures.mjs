// Generates sample PDFs for manual and automated tests: `node scripts/generate-fixtures.mjs`
import { mkdir, writeFile } from 'node:fs/promises'
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'

const OUT_DIR = new URL('../tests/fixtures/', import.meta.url)
const A4 = [595.28, 841.89]

async function sample() {
  const doc = await PDFDocument.create()
  doc.setTitle('Doxera Sample')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const pageSpecs = [
    { size: A4, title: 'Seite 1 – Einleitung' },
    { size: A4, title: 'Seite 2 – Rechnung' },
    { size: [A4[1], A4[0]], title: 'Seite 3 – Querformat' },
    { size: A4, title: 'Seite 4 – Gedrehte Seite', rotate: 90 },
    { size: [612, 792], title: 'Seite 5 – US Letter' },
  ]

  for (const [index, spec] of pageSpecs.entries()) {
    const page = doc.addPage(spec.size)
    if (spec.rotate) page.setRotation(degrees(spec.rotate))
    const { width, height } = page.getSize()

    page.drawRectangle({ x: 0, y: height - 80, width, height: 80, color: rgb(0.31, 0.27, 0.9) })
    page.drawText(spec.title, { x: 40, y: height - 50, size: 22, font: bold, color: rgb(1, 1, 1) })

    const lines = [
      'Doxera ist ein browserbasierter PDF-Editor mit Fokus auf Datenschutz.',
      'Dieses Dokument dient als Testdatei für Rendering, Zoom und Navigation.',
      `Seitengröße: ${Math.round(width)} × ${Math.round(height)} pt`,
      'Rechnungsnummer: RE-2026-0042 · Datum: 04.11.2026 · Betrag: 1.234,56 EUR',
    ]
    lines.forEach((line, i) => {
      page.drawText(line, { x: 40, y: height - 130 - i * 22, size: 12, font })
    })

    page.drawRectangle({
      x: 40,
      y: 80,
      width: width - 80,
      height: height - 340,
      borderColor: rgb(0.8, 0.8, 0.85),
      borderWidth: 1,
    })
    page.drawText(String(index + 1), {
      x: width / 2 - 30,
      y: height / 2 - 80,
      size: 120,
      font: bold,
      color: rgb(0.85, 0.86, 0.95),
    })
    page.drawText(`${index + 1} / ${pageSpecs.length}`, { x: width - 80, y: 40, size: 10, font })
  }

  return doc.save()
}

async function large(pageCount = 200) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage(A4)
    page.drawText(`Seite ${i} von ${pageCount}`, { x: 40, y: 780, size: 24, font })
  }
  return doc.save()
}

await mkdir(OUT_DIR, { recursive: true })
await writeFile(new URL('sample.pdf', OUT_DIR), await sample())
await writeFile(new URL('large-200-pages.pdf', OUT_DIR), await large())
console.log('Fixtures written to tests/fixtures/')
