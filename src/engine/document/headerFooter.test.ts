import { DEFAULT_HEADER_FOOTER, hasStamps, resolveStampText, stampItems } from './headerFooter'

const context = { index: 1, total: 5, fileName: 'Vertrag.pdf', date: new Date(2026, 10, 5) }
const measure = (text: string) => text.length * 5

describe('header and footer', () => {
  it('fills placeholders', () => {
    expect(
      resolveStampText(
        '{datei} – Seite {seite} von {seiten}, {datum}',
        DEFAULT_HEADER_FOOTER,
        context,
      ),
    ).toBe('Vertrag – Seite 2 von 5, 05.11.2026')
    expect(
      resolveStampText('{seite}/{seiten}', { ...DEFAULT_HEADER_FOOTER, firstNumber: 10 }, context),
    ).toBe('11/14')
  })

  it('lays out left, centered and right slots within the margins', () => {
    const settings = {
      ...DEFAULT_HEADER_FOOTER,
      header: ['L', '', 'RR'] as [string, string, string],
      footer: ['', 'Seite {seite}', ''] as [string, string, string],
      margin: 20,
      fontSize: 10,
    }
    const items = stampItems(settings, context, { width: 600, height: 800 }, measure)
    expect(items).toEqual([
      { text: 'L', x: 20, baseline: 28 },
      { text: 'RR', x: 600 - 20 - 10, baseline: 28 },
      { text: 'Seite 2', x: (600 - 35) / 2, baseline: 778 },
    ])
  })

  it('leaves out the first page when asked and knows empty settings', () => {
    expect(
      stampItems(
        { ...DEFAULT_HEADER_FOOTER, skipFirstPage: true },
        { ...context, index: 0 },
        { width: 1, height: 1 },
        measure,
      ),
    ).toEqual([])
    expect(hasStamps(DEFAULT_HEADER_FOOTER)).toBe(true)
    expect(hasStamps({ ...DEFAULT_HEADER_FOOTER, footer: ['', ' ', ''] })).toBe(false)
    expect(hasStamps(null)).toBe(false)
  })
})
