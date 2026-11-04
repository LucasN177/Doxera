import {
  bodyFontSize,
  joinLines,
  structureLines,
  toMarkdown,
  toPlainText,
  type TextLine,
} from './structure'

/** Lines stacked from the top with normal spacing (1.2 × size). */
function stack(
  specs: Array<{ text: string; size?: number; bold?: boolean; left?: number; gapBefore?: number }>,
): TextLine[] {
  let y = 50
  return specs.map(({ text, size = 11, bold = false, left = 50, gapBefore = 0 }) => {
    y += gapBefore
    const line = {
      text,
      left,
      top: y,
      right: left + text.length * size * 0.5,
      bottom: y + size,
      size,
      bold,
    }
    y += size * 1.2
    return line
  })
}

describe('structureLines', () => {
  const lines = stack([
    { text: 'Mietvertrag', size: 24 },
    { text: 'Zwischen Frau Erika Mustermann und Herrn', gapBefore: 12 },
    { text: 'Max Beispiel wird folgender Vertrag ge-' },
    { text: 'schlossen.' },
    { text: 'Leistungen', bold: true, gapBefore: 12 },
    { text: '• Wohnung mit drei Zimmern', gapBefore: 6 },
    { text: '• Stellplatz in der Tiefgarage,' },
    { text: 'gegen Aufpreis', left: 62 },
    { text: '1. Die Miete ist monatlich fällig.', gapBefore: 12 },
    { text: '2. Kaution: drei Monatsmieten.' },
    { text: 'z. B. bei Auszug wird abgerechnet.', gapBefore: 12 },
  ])
  const blocks = structureLines(lines, bodyFontSize(lines))

  it('finds headings, paragraphs and lists', () => {
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Mietvertrag' },
      {
        type: 'paragraph',
        text: 'Zwischen Frau Erika Mustermann und Herrn Max Beispiel wird folgender Vertrag geschlossen.',
      },
      { type: 'heading', level: 3, text: 'Leistungen' },
      {
        type: 'list',
        ordered: false,
        items: [
          { marker: '•', text: 'Wohnung mit drei Zimmern' },
          { marker: '•', text: 'Stellplatz in der Tiefgarage, gegen Aufpreis' },
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          { marker: '1.', text: 'Die Miete ist monatlich fällig.' },
          { marker: '2.', text: 'Kaution: drei Monatsmieten.' },
        ],
      },
      { type: 'paragraph', text: 'z. B. bei Auszug wird abgerechnet.' },
    ])
  })

  it('writes Markdown and plain text', () => {
    const markdown = toMarkdown([blocks])
    expect(markdown).toContain('# Mietvertrag\n\nZwischen Frau')
    expect(markdown).toContain('### Leistungen\n\n- Wohnung mit drei Zimmern\n- Stellplatz')
    expect(markdown).toContain('1. Die Miete ist monatlich fällig.\n2. Kaution')
    const plain = toPlainText([blocks])
    expect(plain).toContain('Mietvertrag\n\nZwischen')
    expect(plain).toContain('• Wohnung mit drei Zimmern')
  })

  it('keeps a number at the start of a wrapped line in the paragraph', () => {
    const wrapped = stack([
      { text: 'Der Vertrag beginnt am' },
      { text: '3. Oktober und läuft ein Jahr.' },
    ])
    expect(structureLines(wrapped, 11)).toEqual([
      { type: 'paragraph', text: 'Der Vertrag beginnt am 3. Oktober und läuft ein Jahr.' },
    ])
  })

  it('separates paragraphs at larger gaps', () => {
    const two = stack([{ text: 'Erster Absatz.' }, { text: 'Zweiter Absatz.', gapBefore: 10 }])
    expect(structureLines(two, 11).map((block) => block.type)).toEqual(['paragraph', 'paragraph'])
  })
})

describe('joinLines', () => {
  it('handles hyphens at the line end', () => {
    expect(joinLines('Ver-', 'trag')).toBe('Vertrag')
    expect(joinLines('Baden-', 'Württemberg')).toBe('Baden-Württemberg')
    expect(joinLines('Nord-', 'und Süddeutschland')).toBe('Nord- und Süddeutschland')
    expect(joinLines('Ende.', 'Neu')).toBe('Ende. Neu')
  })
})

describe('headings in recognized text', () => {
  it('treats a short, slightly larger line standing alone as heading', () => {
    // Scans: no bold information, sizes estimated from the line height
    const lines = stack([
      { text: '§ 1 Mietsache', size: 13 },
      { text: 'Vermietet wird die Wohnung in der Hauptstraße 12', gapBefore: 10 },
      { text: 'in Berlin, bestehend aus drei Zimmern.' },
      { text: '§ 2 Miete', size: 13, gapBefore: 14 },
      { text: 'Die Miete beträgt 980 Euro.', gapBefore: 10 },
    ])
    expect(structureLines(lines, 11).map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'paragraph',
    ])
  })

  it('keeps a slightly larger first line of a paragraph as text', () => {
    const lines = stack([{ text: 'Ein Absatz beginnt', size: 12.5 }, { text: 'und geht weiter.' }])
    expect(structureLines(lines, 11).map((block) => block.type)).toEqual(['paragraph'])
  })
})

describe('label lines', () => {
  it('keeps bold "label: value" lines as text', () => {
    const lines = stack([
      { text: 'Die Leistungen im Überblick.' },
      { text: 'Summe netto: 6.538,80 €', bold: true, gapBefore: 12 },
      { text: 'Zahlbar innerhalb von 14 Tagen.', gapBefore: 12 },
    ])
    expect(structureLines(lines, 11).map((block) => block.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
    ])
  })
})
