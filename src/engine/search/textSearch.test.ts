import { buildPageText, MAX_MATCHES, normalize, searchPages, toRunRanges } from './textSearch'

const page = (...runs: Array<string | [string, boolean]>) =>
  buildPageText(
    runs.map((run) =>
      typeof run === 'string' ? { str: run, hasEOL: false } : { str: run[0], hasEOL: run[1] },
    ),
  )

describe('buildPageText', () => {
  it('concatenates runs and marks line ends', () => {
    const text = page(['Hello', true], 'World')
    expect(text.raw).toBe('Hello\nWorld')
    expect(text.runStarts).toEqual([0, 6])
    expect(text.runLengths).toEqual([5, 5])
  })
})

describe('normalize', () => {
  it('collapses whitespace and lower-cases', () => {
    const { text, map } = normalize('  Foo \n  Bar', false)
    expect(text).toBe('foo bar')
    expect(map).toEqual([2, 3, 4, 5, 9, 10, 11])
  })

  it('keeps case when requested', () => {
    expect(normalize('Foo', true).text).toBe('Foo')
  })
})

describe('toRunRanges', () => {
  it('splits a raw range across runs', () => {
    const text = page('abc', 'def')
    expect(toRunRanges(text, 1, 5)).toEqual([
      { run: 0, start: 1, end: 3 },
      { run: 1, start: 0, end: 2 },
    ])
  })
})

describe('searchPages', () => {
  const pages = [
    page('Rechnung RE-42', ['Betrag:', true], '1.234,56 EUR'),
    page('Keine Treffer'),
    page('rechnung'),
  ]

  it('finds matches case-insensitively across pages', () => {
    const matches = searchPages(pages, 'rechnung', { matchCase: false })
    expect(matches.map((m) => m.pageIndex)).toEqual([0, 2])
    expect(matches[0].ranges).toEqual([{ run: 0, start: 0, end: 8 }])
  })

  it('respects match case', () => {
    expect(searchPages(pages, 'Rechnung', { matchCase: true })).toHaveLength(1)
  })

  it('matches across line breaks and runs', () => {
    const [match] = searchPages(pages, 'betrag: 1.234', { matchCase: false })
    expect(match.ranges).toEqual([
      { run: 1, start: 0, end: 7 },
      { run: 2, start: 0, end: 5 },
    ])
  })

  it('treats repeated whitespace in the query like a single space', () => {
    expect(searchPages(pages, '  rechnung   re-42 ', { matchCase: false })).toHaveLength(1)
  })

  it('returns nothing for empty queries', () => {
    expect(searchPages(pages, '   ', { matchCase: false })).toEqual([])
  })

  it('finds non-overlapping occurrences', () => {
    expect(searchPages([page('aaaa')], 'aa', { matchCase: false })).toHaveLength(2)
  })

  it('caps the number of matches', () => {
    const many = page('x'.repeat(MAX_MATCHES + 10))
    expect(searchPages([many], 'x', { matchCase: false })).toHaveLength(MAX_MATCHES)
  })
})
