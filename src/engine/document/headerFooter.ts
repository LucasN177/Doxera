import { localeTag, t } from '@/i18n'
/** Header and footer for every page: three slots each (left, center, right). */
export interface HeaderFooter {
  header: [string, string, string]
  footer: [string, string, string]
  /** Font size in points. */
  fontSize: number
  color: string
  /** Distance from the edge of the visible page, in points. */
  margin: number
  /** Number of the first page. */
  firstNumber: number
  /** Leave the first page out (cover pages); it still counts. */
  skipFirstPage: boolean
}

export interface StampContext {
  /** 0-based position of the page in the output. */
  index: number
  /** Number of pages in the output. */
  total: number
  fileName: string
  date: Date
}

export interface StampItem {
  text: string
  /** Left end of the text, from the left edge of the visible page (points). */
  x: number
  /** Baseline, from the top edge of the visible page (points). */
  baseline: number
}

export const DEFAULT_HEADER_FOOTER: HeaderFooter = {
  header: ['', '', ''],
  footer: ['', t('Seite {seite} von {seiten}'), ''],
  fontSize: 9,
  color: '#475569',
  margin: 24,
  firstNumber: 1,
  skipFirstPage: false,
}

/** Ready-made layouts for the dialog. */
export const HEADER_FOOTER_PRESETS: Array<{
  name: string
  header: HeaderFooter['header']
  footer: HeaderFooter['footer']
}> = [
  {
    name: t('Seite 1 von 3 (unten mittig)'),
    header: ['', '', ''],
    footer: ['', t('Seite {seite} von {seiten}'), ''],
  },
  { name: t('1 (unten rechts)'), header: ['', '', ''], footer: ['', '', '{seite}'] },
  { name: t('– 1 – (unten mittig)'), header: ['', '', ''], footer: ['', t('– {seite} –'), ''] },
  {
    name: t('Datei und Datum'),
    header: ['{datei}', '', '{datum}'],
    footer: ['', '', t('Seite {seite} von {seiten}')],
  },
]

/**
 * Fills the placeholders of a slot: {seite}/{page}, {seiten}/{pages},
 * {datei}/{file} and {datum}/{date} (German and English names both work).
 */
export function resolveStampText(
  template: string,
  settings: HeaderFooter,
  context: StampContext,
): string {
  const date = context.date.toLocaleDateString(localeTag, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return template
    .replace(/\{(seite|page)\}/gi, String(settings.firstNumber + context.index))
    .replace(/\{(seiten|pages)\}/gi, String(settings.firstNumber + context.total - 1))
    .replace(/\{(datei|file)\}/gi, context.fileName.replace(/\.pdf$/i, ''))
    .replace(/\{(datum|date)\}/gi, date)
    .trim()
}

/** Whether the settings put anything on the pages. */
export function hasStamps(settings: HeaderFooter | null | undefined): settings is HeaderFooter {
  return !!settings && [...settings.header, ...settings.footer].some((slot) => slot.trim())
}

/**
 * Texts and positions for one page, laid out in the visible page as it is
 * displayed (rotation and crop applied): left, centered and right-aligned
 * within the margins.
 *
 * @param measure Width of a text in points at the settings' font size.
 */
export function stampItems(
  settings: HeaderFooter,
  context: StampContext,
  size: { width: number; height: number },
  measure: (text: string) => number,
): StampItem[] {
  if (settings.skipFirstPage && context.index === 0) return []
  const { margin, fontSize } = settings
  const items: StampItem[] = []
  const rows: Array<[HeaderFooter['header'], number]> = [
    // Header: text top at the margin; footer: descenders above the margin
    [settings.header, margin + fontSize * 0.8],
    [settings.footer, size.height - margin - fontSize * 0.2],
  ]
  for (const [slots, baseline] of rows) {
    slots.forEach((template, slot) => {
      const text = resolveStampText(template, settings, context)
      if (!text) return
      const width = measure(text)
      const x =
        slot === 0 ? margin : slot === 1 ? (size.width - width) / 2 : size.width - margin - width
      items.push({ text, x, baseline })
    })
  }
  return items
}
