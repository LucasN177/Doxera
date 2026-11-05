import type { TextBlock } from '@/engine/text/structure'
import { tableToCsv } from '@/engine/text/tables'
import { cellText, dateCell, toCell, type Cell } from './cells'
import type { Sheet } from './xlsx'
import { localeTag, t } from '@/i18n'

export interface ExportComment {
  page: number
  text: string
  color: string
  createdAt: number
  updatedAt: number
}

/** Text marked with a highlight, underline or strike-out. */
export interface ExportHighlight {
  page: number
  type: 'highlight' | 'underline' | 'strikeout'
  text: string
  color: string
}

/** Everything that can be exported from a document. */
export interface DocumentData {
  name: string
  pageCount: number
  /** Structured text of the chosen pages. */
  pages: Array<{ number: number; blocks: TextBlock[] }>
  comments: ExportComment[]
  highlights: ExportHighlight[]
}

export interface DataContent {
  text: boolean
  tables: boolean
  comments: boolean
  highlights: boolean
}

const MARKUP_NAMES = {
  highlight: t('Hervorgehoben'),
  underline: t('Unterstrichen'),
  strikeout: t('Durchgestrichen'),
} as const
const HIGHLIGHT_HEADER = [t('Seite'), t('Art'), t('Text')]

function highlightRows(data: DocumentData): string[][] {
  return data.highlights.map((item) => [String(item.page), MARKUP_NAMES[item.type], item.text])
}

const TYPE_NAMES = {
  heading: t('Überschrift'),
  paragraph: t('Absatz'),
  list: t('Listenpunkt'),
} as const

function tablesOf(data: DocumentData) {
  return data.pages.flatMap(({ number, blocks }) =>
    blocks.flatMap((block) => (block.type === 'table' ? [{ page: number, rows: block.rows }] : [])),
  )
}

/** Text rows: page, type, heading level, content (lists one row per item). */
function textRows(data: DocumentData): string[][] {
  return data.pages.flatMap(({ number, blocks }) =>
    blocks.flatMap((block): string[][] => {
      const page = String(number)
      if (block.type === 'heading')
        return [[page, TYPE_NAMES.heading, String(block.level), block.text]]
      if (block.type === 'paragraph') return [[page, TYPE_NAMES.paragraph, '', block.text]]
      if (block.type === 'list') {
        return block.items.map((item) => [page, TYPE_NAMES.list, '', `${item.marker} ${item.text}`])
      }
      // Tables have their own sheets / files
      return []
    }),
  )
}

function formatDate(time: number): string {
  return new Date(time).toLocaleString(localeTag, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function commentRows(data: DocumentData): string[][] {
  return data.comments.map((comment) => [
    String(comment.page),
    comment.text,
    formatDate(comment.createdAt),
    formatDate(comment.updatedAt),
  ])
}

/** Table cells for spreadsheets: numbers become numbers, the header stays text. */
function tableCells(rows: string[][]): Cell[][] {
  return rows.map((row, index) => (index === 0 ? row : row.map(toCell)))
}

/** One JSON document with the chosen content (dates as ISO 8601). */
export function toJson(data: DocumentData, content: DataContent): string {
  const result: Record<string, unknown> = {
    document: { name: data.name, pages: data.pageCount, exportedAt: new Date().toISOString() },
  }
  if (content.text) {
    result.pages = data.pages.map(({ number, blocks }) => ({
      page: number,
      blocks: blocks.filter((block) => block.type !== 'table'),
    }))
  }
  if (content.tables) {
    result.tables = tablesOf(data).map(({ page, rows }) => ({
      page,
      header: rows[0] ?? [],
      rows: rows.slice(1),
    }))
  }
  if (content.comments) {
    result.comments = data.comments.map((comment) => ({
      page: comment.page,
      text: comment.text,
      color: comment.color,
      createdAt: new Date(comment.createdAt).toISOString(),
      updatedAt: new Date(comment.updatedAt).toISOString(),
    }))
  }
  if (content.highlights) result.highlights = data.highlights
  return `${JSON.stringify(result, null, 2)}\n`
}

/** Workbook sheets: "Text", one per table, "Kommentare". */
export function toSheets(data: DocumentData, content: DataContent): Sheet[] {
  const sheets: Sheet[] = []
  if (content.text) {
    sheets.push({
      name: t('Text'),
      header: true,
      rows: [[t('Seite'), t('Typ'), t('Ebene'), t('Inhalt')], ...textRows(data)].map(
        (row, index) =>
          index === 0 ? row : [toCell(row[0]), row[1], row[2] ? toCell(row[2]) : '', row[3]],
      ),
    })
  }
  if (content.tables) {
    tablesOf(data).forEach(({ page, rows }, index) =>
      sheets.push({
        name: `Tabelle ${index + 1} (S. ${page})`,
        header: true,
        rows: tableCells(rows),
      }),
    )
  }
  if (content.comments) {
    sheets.push({
      name: t('Kommentare'),
      header: true,
      rows: [
        [t('Seite'), t('Kommentar'), t('Erstellt'), t('Geändert')],
        ...data.comments.map((comment) => [
          toCell(String(comment.page)),
          comment.text,
          dateCell(comment.createdAt),
          dateCell(comment.updatedAt),
        ]),
      ],
    })
  }
  if (content.highlights) {
    sheets.push({
      name: t('Markierungen'),
      header: true,
      rows: [HIGHLIGHT_HEADER, ...highlightRows(data)].map((row, index) =>
        index === 0 ? row : [toCell(row[0]), ...row.slice(1)],
      ),
    })
  }
  return sheets
}

/** CSV files (semicolons, for spreadsheets): text, one per table, comments. */
export function toCsvFiles(
  data: DocumentData,
  content: DataContent,
  base: string,
): Array<{ name: string; text: string }> {
  const files: Array<{ name: string; text: string }> = []
  if (content.text) {
    files.push({
      name: `${base}-text.csv`,
      text: tableToCsv([[t('Seite'), t('Typ'), t('Ebene'), t('Inhalt')], ...textRows(data)]),
    })
  }
  if (content.tables) {
    tablesOf(data).forEach(({ rows }, index) =>
      files.push({
        name: `${base}-tabelle-${index + 1}.csv`,
        text: tableToCsv(rows.map((row) => row.map((cell) => cellText(cell)))),
      }),
    )
  }
  if (content.comments) {
    files.push({
      name: `${base}-kommentare.csv`,
      text: tableToCsv([
        [t('Seite'), t('Kommentar'), t('Erstellt'), t('Geändert')],
        ...commentRows(data),
      ]),
    })
  }
  if (content.highlights) {
    files.push({
      name: `${base}-markierungen.csv`,
      text: tableToCsv([HIGHLIGHT_HEADER, ...highlightRows(data)]),
    })
  }
  return files
}

/** How much there is to export (for the dialog). */
export function dataSummary(data: DocumentData) {
  return {
    blocks: textRows(data).length,
    tables: tablesOf(data).length,
    comments: data.comments.length,
    highlights: data.highlights.length,
  }
}
