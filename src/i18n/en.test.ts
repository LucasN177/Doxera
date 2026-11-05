import { en } from './en'

/** All source files (without tests), as text. */
const sources = import.meta.glob(
  ['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}', '!/src/i18n/**'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>

/** First (literal) arguments of all t() calls. */
function usedTexts(): Map<string, string> {
  const found = new Map<string, string>()
  const call = /(?<![\w.])t\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  for (const [file, source] of Object.entries(sources)) {
    for (const match of source.matchAll(call)) {
      const quote = match[1]!
      // The literal as JavaScript reads it (escapes resolved)
      const text = JSON.parse(
        `"${match[2]!.replace(/\\'/g, "'").replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`.replace(
          quote === '"' ? /\\\\"/g : /$^/,
          '\\"',
        ),
      ) as string
      found.set(text, file)
    }
  }
  return found
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1]!)
    // Header/footer placeholders have English names too
    .map((name) => ({ seite: 'page', seiten: 'pages', datei: 'file', datum: 'date' })[name] ?? name)
    .sort()

describe('English texts', () => {
  const used = usedTexts()

  it('finds the texts of the interface', () => {
    expect(used.size).toBeGreaterThan(500)
    expect(used.has('PDF öffnen')).toBe(true)
  })

  it('has a translation for every text', () => {
    const missing = [...used]
      .filter(([text]) => !(text in en))
      .map(([text, file]) => `${file}: ${text}`)
    expect(missing).toEqual([])
  })

  it('keeps the placeholders of every text', () => {
    const broken = Object.entries(en).filter(
      ([german, english]) => placeholders(german).join() !== placeholders(english).join(),
    )
    expect(broken).toEqual([])
  })

  it('has no translations left over', () => {
    expect(Object.keys(en).filter((text) => !used.has(text))).toEqual([])
  })
})
